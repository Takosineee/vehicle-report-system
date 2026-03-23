const sql =require("mssql");
require("dotenv").config();

const config={
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PWD,
    port: 1433,
    options:{
        encrypt: true,
        trustServerCertificate: true
    }
}

const poolPromise = sql.connect(config);

module.exports={sql, poolPromise};