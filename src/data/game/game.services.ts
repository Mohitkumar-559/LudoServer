import { RedisStorage } from "@data/game.redis";
import { gameLog } from "@lib/logger";
import {GameRepo} from "./game.repo"
const EXPIRE_TIME = 100000
export class GameServices {
    private readonly _gameRepo : GameRepo;
    private readonly _gameRedis : RedisStorage
    constructor(private readonly repo: GameRepo, gameRedis: RedisStorage) {
        this._gameRepo = repo;
        this._gameRedis = gameRedis;
      }
      async createGameEntryOnStart(mongoData: any, redisData:any) {
        const mongoAck = await this._gameRepo.create(mongoData);
        const redisAck  = await this._gameRedis.hmset(mongoData._id, redisData, EXPIRE_TIME);
        return {mongoAck,redisAck};
      }
      async createGameEntryOnEnd(mongoData: any, redisData:any) {
        const mongoAck = await this._gameRepo.findByIdAndUpdate(mongoData._id,mongoData, { lean: true });
        const redisAck  = await this._gameRedis.hmset(mongoData._id, redisData, EXPIRE_TIME);
        return {mongoAck,redisAck};
      }

      async syncGameState(gameId: string, data: any) {
        // gameLog(gameId, 'Last sync state =>',data);
        return await this._gameRedis.hmset(gameId, data, EXPIRE_TIME);
      }

      async getFullGameState(gameId: string) {
        return await this._gameRedis.hgetall(gameId);
      }

      async getPartialGameState(gameId: string, keys: string) {
        return await this._gameRedis.hmget(gameId, keys);
      }

      async updateGameEntryOnEnd(gameId: string, redisData: any, mongoData:any) {
        await this._gameRepo.findByIdAndUpdate(gameId, mongoData, { lean: true });
        await this._gameRedis.hmset(gameId, redisData, EXPIRE_TIME);
      }
}