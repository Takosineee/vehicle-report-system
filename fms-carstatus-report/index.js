const express = require('express');
const cors = require('cors');
const { sql, poolPromise, storageClient } = require('./connection.js');
const { odata } = require("@azure/data-tables");
const { pool } = require('mssql');
const app = express();
const port = process.env.PORT || 3000;
const path = require("path");

app.use(cors());
app.use(express.json());

const formatDisplayDateTime = (value) => {
  const date = new Date(value);
  if (isNaN(date)) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}/${month}/${day} ${hour}:${minute}`;
};

//cache
const cacheStore = {
  carsByCompany: new Map(),
  areasByCompany: new Map(),
  fleetsByCompany: new Map(),
  carsByFleet: new Map(),
  companyName: new Map(),
}
const CACHE_TTL_MS = 30 * 60 * 1000;
function setCache(mapName, key, val, ttl = CACHE_TTL_MS) {
  mapName.set(key, {
    val,
    expireTime: Date.now() + ttl
  })
}
function getCache(mapName, key) {
  const item = mapName.get(key);
  if (!item) return null;
  if (Date.now() > item.expireTime) {
    mapName.delete(key);
    return null;
  }
  return item.val;
}



async function getCarsMapByCompany(companyId) {
  const cached = getCache(cacheStore.carsByCompany, companyId);
  if (cached) {
    return cached;
  }
  else {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input('CompanyID', sql.NVarChar, companyId || '')
      .query(`SELECT CompanyName, fleetSetting_CARInfoID, CarNo FROM Fleetmgm_fleetSetting_CARInfo(NOLOCK) WHERE CompanyID = @CompanyID`)
    const records = result.recordset;

    const carNoMap = new Map(records.map(c => [c.fleetSetting_CARInfoID, c.CarNo]));
    if (records.length > 0) {
      setCache(cacheStore.companyName, companyId, records[0].CompanyName);
    }

    setCache(cacheStore.carsByCompany, companyId, carNoMap);
    return carNoMap;
  }
}
async function getAreasMapByCompany(companyId) {
  const cached = getCache(cacheStore.areasByCompany, companyId);
  if (cached) {
    return cached;
  }
  else {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input('CompanyID', sql.NVarChar, companyId || '')
      .query(`SELECT r.RegionSettingID, r.AreaName
    FROM FMS_RegionSetting r WITH (NOLOCK)
    LEFT JOIN Modules m ON r.ModuleID = m.ModuleID
    LEFT JOIN (SELECT c.fleetSetting_CompanyID, c.SubDomain, c.FullName, m.PortalID
      FROM Fleetmgm_fleetSetting_Company c LEFT JOIN Modules m ON c.ModuleID = m.ModuleID
    ) c ON m.PortalID = c.PortalID
    WHERE c.fleetSetting_CompanyID = @CompanyID`)

    const records = result.recordset;

    const areaMap = new Map(records.map(a => [a.RegionSettingID, a.AreaName]));
    setCache(cacheStore.areasByCompany, companyId, areaMap);

    return areaMap;
  }
}

async function getFleetsByCompany(companyId) {
  const cached = getCache(cacheStore.fleetsByCompany, companyId);
  if (cached) return cached;

  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("CompanyID", sql.NVarChar, companyId)
    .query("SELECT fleetID, FleetName FROM Fleetmgm_fleetSetting_CARInfo WHERE CompanyID=@CompanyID GROUP BY fleetID, FleetName ORDER BY FleetName");

  const records = result.recordset;
  setCache(cacheStore.fleetsByCompany, companyId, records);
  return records;

}

async function getCarsByFleetIds(fleetIds) {
  const cached = getCache(cacheStore.carsByFleet, fleetIds);
  if (cached) return cached;

  const pool = await poolPromise;

  const request = pool.request();
  let placeholders = fleetIds.map((id, i) => {
    request.input(`fleetID${i}`, sql.NVarChar, id);
    return `@fleetID${i}`
  }).join(", ")

  const result = await request.query(`SELECT DISTINCT fleetID, fleetSetting_CARInfoID AS CarID, CarNo FROM Fleetmgm_fleetSetting_CARInfo WHERE fleetID IN (${placeholders}) ORDER BY CarNo;`);
  const records = result.recordset;

  setCache(cacheStore.carsByFleet, fleetIds, records)
  return records

}

function createPartitionKey(carId, date) {

  const d = new Date(date);

  if (isNaN(d)) {
    throw new Error("Invalid date");
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${carId}-${year}${month}${day}`;
}

function formatDateOnly(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDatesBetween(startDate, endDate) {
  const dates = [];
  const current = formatDateOnly(startDate);
  const end = formatDateOnly(endDate);

  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

async function getTripLog(carId, begin, end) {
  const logs = [];
  const allDates = getDatesBetween(begin, end);

  for (const date of allDates) {
    const key = createPartitionKey(carId, date);

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
  }

  return logs;
}


app.get('/api/getFleets', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'company id is required.' })
    const fleets = await getFleetsByCompany(companyId);
    res.json(fleets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
})

app.get('/api/getCarsByFleetIds', async (req, res) => {
  const { fleetID } = req.query;
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

    const cars = await getCarsByFleetIds(fleetIDs);
    res.json(cars);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/report', async (req, res) => {
  const { fleets, cars, beginDateTime, endDateTime, companyId } = req.body;

  if (!fleets?.length || !cars?.length || !beginDateTime || !endDateTime) {
    return res.status(400).json({ error: "all fields are required." });
  }
  if (!companyId) return res.status(400).json({ error: 'company id is required.' })
  try {
    const begin = new Date(beginDateTime);
    const end = new Date(endDateTime);

    if (isNaN(begin) || isNaN(end)) {
      return res.status(400).json({ error: "invalid date format." });
    }

    const carNoMap = await getCarsMapByCompany(companyId);
    const areaNameMap = await getAreasMapByCompany(companyId);

    const reportLogs = [];

    for (const carId of cars) {
      const logs = await getTripLog(carId, begin, end);
      const filteredLogs = logs.filter(t =>
        new Date(t.BEGIN_TIME) >= begin &&
        new Date(t.END_TIME) <= end
      )
        .sort((a, b) => new Date(a.BEGIN_TIME) - new Date(b.BEGIN_TIME));

      if (filteredLogs.length === 0) {
        continue;
      }

      const carNo = carNoMap.get(carId) || "";

      let totalDistance = 0;
      let totalDrivingTime = 0;
      let totalStayTime = 0;

      filteredLogs.forEach((t, index) => {
        const next = filteredLogs[index + 1];

        let stayTime = 0;
        if (next) {
          const currentEnd = new Date(t.END_TIME);
          const nextBegin = new Date(next.BEGIN_TIME);
          stayTime = Math.max(0, Math.floor((nextBegin - currentEnd) / 60000));
        }

        const distance = Math.round((((t.LOW_SPEED_DISTANCE + t.MID_SPEED_DISTANCE) / 1000) + Number.EPSILON) * 100) / 100;
        const drivingTime = Number((t.TOTAL_DRIVING_TIME / 60).toFixed(2));

        totalDistance += distance;
        totalDrivingTime += drivingTime;
        totalStayTime += stayTime;

        reportLogs.push({
          id: `${carNo}-${t.TRIP_DATE}-${index + 1}`,
          seq: index + 1,
          BegAddress: t.BEGIN_ADDRESS,
          EndAddress: t.END_ADDRESS,
          BeginTime: formatDisplayDateTime(t.BEGIN_TIME),
          EndTime: formatDisplayDateTime(t.END_TIME),
          TripDate: t.TRIP_DATE,
          CarNo: carNo,
          BegArea: areaNameMap.get(t.BEGIN_REGION_ID) || "",
          EndArea: areaNameMap.get(t.END_REGION_ID) || "",
          TotalDistance: distance,
          TotalDrivingTime: drivingTime,
          StayTime: stayTime,
          isTotalRow: false
        });
      });

      reportLogs.push({
        id: `${carNo}-total`,
        seq: "",
        BegAddress: "",
        EndAddress: "",
        BeginTime: "",
        EndTime: "",
        TripDate: "",
        CarNo: `合計`,
        BegArea: "",
        EndArea: "",
        TotalDistance: Number(totalDistance.toFixed(2)),
        TotalDrivingTime: Number(totalDrivingTime.toFixed(2)),
        StayTime: Number(totalStayTime.toFixed(2)),
        isTotalRow: true
      });
    }

    if (reportLogs.length === 0) {
      return res.status(400).json({ error: "triplogs not loaded." });
    }

    res.json({
      header: getCache(cacheStore.companyName, companyId),
      rows: reportLogs
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"))
})
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
