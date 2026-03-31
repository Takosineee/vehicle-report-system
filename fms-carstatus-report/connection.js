//db
const sql = require("mssql");
require("dotenv").config();
const config = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PWD,
    port: 1433,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
}
const poolPromise = sql.connect(config);

//storage
const { TableClient } = require("@azure/data-tables");
const storageConnString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const table = "TripLog";
const storageClient = TableClient.fromConnectionString(storageConnString, table);

// async function test() {
//     const entities = storageClient.listEntities({
//         queryOptions: {
//             filter: `TRIP_DATE  ''`,
//             select: [
//                 "CAR_ID",
//                 "TRIP_DATE",
//                 "BEGIN_SEQ_NO",
//                 "BEGIN_TIME",
//                 "BEGIN_REGION_ID",
//                 "BEGIN_ADDRESS",
//                 "END_TIME",
//                 "END_REGION_ID",
//                 "END_ADDRESS",
//                 "LOW_SPEED_DISTANCE",
//                 "MID_SPEED_DISTANCE",
//                 "TOTAL_DRIVING_TIME",
//                 "PartitionKey",
//                 "RowKey"
//             ]
//         }
//     })
//     for await (const entity of entities) {
//         console.log(entity)
//     }
// }
// test().catch(console.error);

module.exports = { sql, poolPromise, storageClient };