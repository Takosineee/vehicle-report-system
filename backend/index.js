const express = require('express');
const cors = require('cors');
const { parse, isAfter, isBefore, isEqual, startOfDay, endOfDay } = require('date-fns');
const { sql, poolPromise } = require('./db');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());




app.get('/api/getFleets', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT fleetID, FleetName FROM FMS_CarVehicleTrip_DetailsAll GROUP BY fleetID, FleetName ORDER BY FleetName");
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

    const result = await request.query(`SELECT DISTINCT fleetID, CarID, CarNo FROM FMS_CarVehicleTrip_DetailsAll WHERE fleetID IN (${placeholders}) ORDER BY CarNo;`);

    res.json(result.recordset);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/report', async (req, res) => {
  //post-> req.body
  const { fleets, cars, startDate, endDate, startTime, endTime } = req.body;
  if (!fleets?.length || !cars?.length || !startDate || !endDate || !startTime || !endTime) {
    return res.status(400).json({ error: "all fileds are required." })
  }

  try {
    const pool = await poolPromise;
    const request = pool.request();


    let fleetsPlaceholders = fleets.map((f, i) => {
      request.input(`fleetID${i}`, sql.NVarChar, f || "");
      return `@fleetID${i}`
    }).join(", ")

    let carsPlaceholders = cars.map((c, i) => {
      request.input(`CarID${i}`, sql.NVarChar, c || "");
      return `@CarID${i}`
    }).join(", ")
    console.log(startDate)
    console.log(startTime)
    request
      .input("startDate", sql.VarChar, startDate || "")
      .input("endDate", sql.VarChar, endDate || "")
      .input("startTime", sql.VarChar, startTime || "")
      .input("endTime", sql.VarChar, endTime || "")
    const queryString = `
  SELECT * 
  FROM FMS_CarVehicleTrip_DetailsAll WITH(NOLOCK)
  WHERE fleetID IN (${fleetsPlaceholders})
    AND CarID IN (${carsPlaceholders})
    AND BeginTime2 BETWEEN 
      CONVERT(datetime, (@startDate + ' ' + @startTime + ':00:00'))
      AND CONVERT(datetime, (@endDate + ' ' + @endTime + ':00:00'))
`;

    console.log(queryString);
    const result = await request.query(queryString);

    const records = result.recordset.map((trip, index) => ({
      ...trip,
      seq: index + 1
    }));
    res.json(records);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, 'localhost', () => {
  console.log(`Backend listening at http://localhost:${port}`);
});
