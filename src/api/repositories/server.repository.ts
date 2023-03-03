import { GameServer } from "@web/application";
import Redis from "ioredis";
import { RedisKeys } from "redis/helpers/enums/redis.keys";

export class ServerRepository{
    private static _instance: ServerRepository;
    private _redisClient: Redis;

    constructor(){
      this._redisClient = GameServer.Instance.REDIS.INSTANCE
    }

    static get Instance() {
        if(!this._instance) {
          this._instance = new ServerRepository();
        }
        return this._instance;
      }

    public async addServer(serverData: any){
      if(!serverData.ip){
        return false
      }
      await this._redisClient.hmset(RedisKeys.getServerKey(serverData.ip),serverData)
      await this._redisClient.zadd(RedisKeys.getActiveServerKey(), 0, serverData.ip);
      return true
    }

    public async getServerByIp(serverIp: string){
      var server = await this._redisClient.hgetall(RedisKeys.getServerKey(serverIp))
      return Object.keys(server).length>0 ? server : null
    }

    public async removeGame(serverIp: string, gameId: string){
      const resp = await this._redisClient.pipeline().zincrby(RedisKeys.getActiveServerKey(), -1, serverIp).
      hincrby(RedisKeys.getServerKey(serverIp), 'activeGames', -1).
      srem(RedisKeys.getRunningGameKey(serverIp), -1, gameId).exec()
      return resp[1][1]
    }


    public async removeServerFromActive(serverIp: string){
      await this._redisClient.zrem(RedisKeys.getActiveServerKey(), serverIp);
    }

    public async getRunningGameOnServre(serverIp: string){
      const resp = await this._redisClient.hget(RedisKeys.getServerKey(serverIp), 'activeGames');
      return resp
    }

    public async isGameRunningOnServer(serverIp: string, gameId: string){
      if(!serverIp || !gameId){
        return false
      }
      const isGameRunning = await this._redisClient.sismember(RedisKeys.getRunningGameKey(serverIp), gameId);
      return isGameRunning;
    }

    public async getAvaiableServer(){
      const serverList = await this._redisClient.zrangebyscore(RedisKeys.getActiveServerKey(), '-inf', process.env.SERVER_HEALTHY_CAPACITY)
      return serverList;
    } 

    public async addGame(serverIp: string, gameId: string) {
      const pipeline = this._redisClient.pipeline();
      pipeline.hincrby(RedisKeys.getServerKey(serverIp), 'totalGames', 1);
      pipeline.hincrby(RedisKeys.getServerKey(serverIp), 'activeGames', 1);
      pipeline.zincrby(RedisKeys.getActiveServerKey(), 1, serverIp);
      pipeline.sadd(RedisKeys.getRunningGameKey(serverIp), gameId);
      const resp = await pipeline.exec()
      return resp;
    }
    

    // public async
}