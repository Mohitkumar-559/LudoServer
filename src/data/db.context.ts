import mongoose from 'mongoose'
import { userModel } from '@data/user'
import { finalResult, gameModel } from '@data/game'
import * as sql from "mssql";
//import * as sql_2 from "mssql";
//import { ConnectionPool } from 'sql';



export class DBContext {
  private static _instance: DBContext
  private _db: typeof mongoose
  private _gameDbCon: sql.ConnectionPool;
  private _transDbCon: sql.ConnectionPool;

  static get Instance() {
    if (!this._instance) {
      this._instance = new DBContext();
    }
    return this._instance;
  }
  async connect() {
    const options = {
      autoIndex: false, // Don't build indexes
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      family: 4 // Use IPv4, skip trying IPv6
    }

    this._db = await mongoose.connect(process.env.MONGO_URL, options)
    this._db.set('debug', true);
    console.log('connected to Mongo-db')
  }



  async mssql_game_connect() {
    try {
      //console.log("sql1");
      // make sure that any items are correctly URL encoded in the connection string
      this._gameDbCon = await sql.connect(process.env.GAME_DB_CONN)
      //console.log(this._gameDbCon);
      this._gameDbCon.on('connect', function(){
         console.log("Sql Transaction database connected");
       });

      // this._gameDbCon.on('error', function(){
      //   console.log("Sql Transaction database not connected");
      // });
    } catch (err) {
      console.log(err)
      // ... error checks
    }
  };

  async mssql_transaction_connect() {
    try {
      console.log("sql2");
      // make sure that any items are correctly URL encoded in the connection string
      this._transDbCon = await sql.connect(process.env.TRANSACTION_DB_CONN)
      this._transDbCon.on('connect', function(){
        console.log("Sql Transaction database connected");
      });

      this._transDbCon.on('connect', function(){
        console.log("Sql Transaction database not connected");
      });

      console.log("2");
    } catch (err) {
      console.log(err)
      // ... error checks
    }
  }
  get user() {
    console.log("this db has mode", this._db.modelNames())
    return this._db.model<mongoose.Document>('User', userModel)
  }
  get game() {
    this._db.model
    return this._db.model<mongoose.Document>('Game', gameModel)
  }

  get gameConnection() {
    return this._gameDbCon;
  }

  get transactionConnection() {
    return this._transDbCon;
  }

  get finalResult(){
    return this._db.model<mongoose.Document>('FinalResultLog', finalResult);
  }
  
}

