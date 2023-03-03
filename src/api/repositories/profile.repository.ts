import { IUser } from "@data/user";
import { GameServer } from "@web/application";
import Redis from "ioredis";
import { RedisKeys } from "redis/helpers/enums/redis.keys";

export class ProfileRepository{
    private static _instance: ProfileRepository;
    private _redisClient: Redis;

    constructor(){
        this._redisClient = GameServer.Instance.REDIS.INSTANCE
    }

    static get Instance() {
        if(!this._instance) {
          this._instance = new ProfileRepository();
        }
        return this._instance;
      }

    public async getProfile(profileId: IUser["_id"]){
      if(!profileId){
        return false
      }
      const profileData = await this._redisClient.hgetall(RedisKeys.getProfileKey(profileId))
      return Object.keys(profileData).length>0 ? profileData : null
    }

    public async getUserAssignedServer(profileId: IUser["_id"]){
        if(!profileId){
            return false
          }
        const serverIp = await this._redisClient.hget(RedisKeys.getProfileKey(profileId), 'assignedServer');
        return serverIp;
    }

    public async createProfile(profileData: IUser){
        if(!profileData._id){
            return false
          }
        await this._redisClient.hmset(RedisKeys.getProfileKey(profileData._id),profileData);
        return true;
    }

}