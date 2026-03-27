const express = require('express');
const cors = require('cors');
const { sql, poolPromise, storageClient } = require('./connection.js');
const { odata } = require("@azure/data-tables");
const { pool } = require('mssql');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// const limitDate = getLimitTripDate(3);

// function getLimitTripDate(monthCount) {
//   const today = new Date();
//   today.setMonth(today.getMonth() - monthCount);
//   const startDateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
//   return startDateStr;
// }

const cacheStore={
  carByCompany: new Map(),
  areasByCompany: new Map()
}
const CACHE_TTL_MS=10 * 60 * 1000;
function setCache(map, key, val, ttl=CACHE_TTL_MS){
  map.set(key,{
    val,
    expireTime: Date.now()+ttl
  })
}
function getCache(map, key){
  const item = map.get(key);
  if(!item) return null;
  if(Date.now()>item.expiryTime) {
    map.delete(key);
    return null;
  }
  return item.val;
}

async function getCarsMapByCompany(companyId){
  const cached=getCache(cacheStore.carByCompany,companyId);
  if(cached){
    return cached;
  }
  else{
    const pool = await poolPromise;
    const result = await pool
    .request()
    .input('CompanyID', sql.NVarChar, companyId||'')
    .query(`SELECT fleetSetting_CARInfoID, CarNo from Fleetmgm_fleetSetting_CARInfo(NOLOCK) where CompanyID = @CompanyID`)
    const records= result.recordset;

    const carNoMap = new Map(records.map(c => [c.fleetSetting_CARInfoID, c.CarNo]));
    setCache(cacheStore.carByCompany, companyId, carNoMap);
    
    return carNoMap;
  }
}
async function getAreasMapByCompany(companyId){
  const cached=getCache(cacheStore.areasByCompany,companyId);
  if(cached){
    return cached;
  }
  else{
    const pool = await poolPromise;
    const result = await pool
    .request()
    .input('CompanyID', sql.NVarChar, companyId||'')
    .query(`SELECT r.RegionSettingID, r.AreaName
    FROM FMS_RegionSetting r WITH (NOLOCK)
    LEFT JOIN Modules m ON r.ModuleID = m.ModuleID
    LEFT JOIN (
      SELECT c.fleetSetting_CompanyID, c.SubDomain, c.FullName, m.PortalID
      FROM Fleetmgm_fleetSetting_Company c
      LEFT JOIN Modules m ON c.ModuleID = m.ModuleID
    ) c ON m.PortalID = c.PortalID
    WHERE c.fleetSetting_CompanyID = @CompanyID`)
    
    const records= result.recordset;

    const areaMap = new Map(records.map(a => [a.RegionSettingID, a.AreaName]));
    setCache(cacheStore.areasByCompany, companyId, areaMap);
    
    return areaMap;
  }
}


function createPartitionKey(carId, date) {

  const d = new Date(date);

  if (isNaN(d)) {
    throw new Error("Invalid date");
  }

  const year = d.getFullYear();
  const month = String(d.getMonth()+1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${carId}-${year}${month}${day}`;
}

async function filteredTripLog(carId, begin) {
  const logs = [];
  const key = createPartitionKey(carId, begin);

  console.log('key:', key);

  const entities = storageClient.listEntities({
    queryOptions: {
      filter: odata`PartitionKey eq ${key}`,
      select: [
        "CAR_ID",
        "TRIP_DATE",
        "BEGIN_SEQ_NO",
        "BEGIN_TIME",
        "BEGIN_REGION_ID",
        "BEGIN_ADDRESS",
        "END_TIME",
        "END_REGION_ID",
        "END_ADDRESS",
        "LOW_SPEED_DISTANCE",
        "MID_SPEED_DISTANCE",
        "TOTAL_DRIVING_TIME",
        "PartitionKey",
        "RowKey"
      ]
    }
  });

  for await (const entity of entities) {
    logs.push(entity);
  }

  console.log('logs from storage:', logs);

  return logs;
}


app.get('/api/getFleets', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT fleetID, FleetName FROM Fleetmgm_fleetSetting_CARInfo GROUP BY fleetID, FleetName ORDER BY FleetName");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
})

app.get('/api/getCarsByFleetIds', async (req, res) => {
  const { fleetID } = req.query;
  console.log(fleetID)
  if (!fleetID) {
    return res.status(400).json({ error: 'fleetIds is required' });
  }
  let fleetIDs = [];
  try {
    if (!Array.isArray(fleetID)) {
      fleetIDs = [fleetID];
    }
    else {
      fleetIDs = fleetID;
    }
    const pool = await poolPromise;

    const request = pool.request();
    let placeholders = fleetIDs.map((id, i) => {
      request.input(`fleetID${i}`, sql.NVarChar, id);
      return `@fleetID${i}`
    }).join(", ")

    const result = await request.query(`SELECT DISTINCT fleetID, fleetSetting_CARInfoID AS CarID, CarNo FROM Fleetmgm_fleetSetting_CARInfo WHERE fleetID IN (${placeholders}) ORDER BY CarNo;`);

    res.json(result.recordset);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/report', async (req, res) => {
  const { fleets, cars, beginDateTime, endDateTime } = req.body;

  console.log('fleets:', fleets);
  console.log('cars:', cars);
  console.log('beginDateTime:', beginDateTime);
  console.log('endDateTime:', endDateTime);

  if (!fleets?.length || !cars?.length || !beginDateTime || !endDateTime) {
    return res.status(400).json({ error: "all fields are required." });
  }

  try {
    const begin = new Date(beginDateTime);
    const end = new Date(endDateTime);
    console.log(begin)
    if (isNaN(begin) || isNaN(end)) {
      return res.status(400).json({ error: "invalid date format." });
    }

    let tripLogs = [];

    for (let i = 0; i < cars.length; i++) {
      console.log('carId:', cars[i]);

      const logs = await filteredTripLog(cars[i], begin);

      const filteredLogs = logs.filter(t =>

        new Date(t.BEGIN_TIME) > begin &&
        new Date(t.END_TIME) < end
      );

      tripLogs.push(...filteredLogs);
    }

    console.log('tripLogs:', tripLogs);

    if (tripLogs.length === 0) {
      return res.status(400).json({ error: "triplogs not loaded." });
    }

    const pool = await poolPromise;
    const request = pool.request();
    const request2 = pool.request();

    const carsPlaceholders = cars.map((c, i) => {
      request.input(`fleetSetting_CARInfoID${i}`, sql.NVarChar, c || "");
      return `@fleetSetting_CARInfoID${i}`;
    }).join(", ");

    const regionIds = [...new Set(
      tripLogs.flatMap(t => [t.BEGIN_REGION_ID, t.END_REGION_ID].filter(Boolean))
    )];

    const regionPlaceholders = regionIds.map((r, i) => {
      request2.input(`RegionSettingID${i}`, sql.NVarChar, r || "");
      return `@RegionSettingID${i}`;
    }).join(", ");

    const result = await request.query(`
      SELECT fleetSetting_CARInfoID, CarNo
      FROM Fleetmgm_fleetSetting_CARInfo WITH (NOLOCK)
      WHERE fleetSetting_CARInfoID IN (${carsPlaceholders})
    `);

    const result2 = await request2.query(`
      SELECT RegionSettingID, AreaName
      FROM FMS_RegionSetting WITH (NOLOCK)
      WHERE RegionSettingID IN (${regionPlaceholders})
    `);

    const carsInfo = result.recordset;
    const areas = result2.recordset;

    const carNoMap = new Map(carsInfo.map(c => [c.fleetSetting_CARInfoID, c.CarNo]));
    const areaNameMap = new Map(areas.map(a => [a.RegionSettingID, a.AreaName]));

    const sortedTripLogs = [...tripLogs].sort((a, b) => {
      const carNoA = carNoMap.get(a.CAR_ID) || "";
      const carNoB = carNoMap.get(b.CAR_ID) || "";

      if (carNoA !== carNoB) {
        return carNoA.localeCompare(carNoB);
      }

      return String(a.BEGIN_TIME).localeCompare(String(b.BEGIN_TIME));
    });

    const seqMap = new Map();

    const reportLogs = sortedTripLogs.map(t => {
      const carNo = carNoMap.get(t.CAR_ID) || "";
      const seq = (seqMap.get(carNo) || 0) + 1;
      seqMap.set(carNo, seq);

      return {
        seq,
        BegAddress: t.BEGIN_ADDRESS,
        EndAddress: t.END_ADDRESS,
        BeginTime: new Date(t.BEGIN_TIME),
        EndTime: new Date(t.END_TIME),
        TripDate: t.TRIP_DATE,
        CarNo: carNo,
        BegArea: areaNameMap.get(t.BEGIN_REGION_ID) || "",
        EndArea: areaNameMap.get(t.END_REGION_ID) || "",
        TotalDistance: Number(((t.LOW_SPEED_DISTANCE + t.MID_SPEED_DISTANCE) / 60).toFixed(2)),
        TotalDrivingTime: Number((t.TOTAL_DRIVING_TIME / 60).toFixed(2)),
        StayTime: Number((t.TOTAL_DRIVING_TIME / 60).toFixed(2))
      };
    });

    res.json(reportLogs);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, 'localhost', () => {
  console.log(`Backend listening at http://localhost:${port}`);
});
