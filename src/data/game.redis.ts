import { gameLog } from "@lib/logger";
import  Redis from "ioredis";
export class RedisStorage {
    private  redisClient : Redis;
    public constructor(private opts : any) {
        this.redisClient =  new Redis(opts.host);
        // this.redisClient = new Redis(
        //     {
        //         host : opts.host,
        //         port : opts.port
        //     }
        // );
        this.redisClient.on("error", (err:any) => {
            console.log("Redis error", err);
        });
        this.redisClient.on("connect", () => {
            console.log("Redis connected");
        });
    }

    public get Instance(){
        return 
    }

    private gameKey(gameId: string) {
        console.log("\n gameKey ", `game:${gameId}`);
        return `game:${gameId}`;
    }
    public async hgetall(gameId: string) : Promise<any> {
        const data = await this.redisClient.hgetall(this.gameKey(gameId));
        if(data && data._id) {
            gameLog(data._id, 'Redis raw data of game', data)
            // console.log(" hgetall ",data);
            const resp = {
                _id: data._id,
                capacity: parseInt(data.capacity),
                isFull: data.isFull == 'true' ? true : false,
                turnIndex: parseInt(data.turnIndex),
                state: parseInt(data.state),
                startedAt: parseInt(data.startedAt),
                phase: parseInt(data.phase),
                diceValue: parseInt(data.diceValue),
                // rolledValues: [],
                rollTime: parseInt(data.rollTime),
                moveTime: parseInt(data.moveTime),
                // timeout: 
                lastTurnTimeMilli: parseInt(data.lastTurnTimeMilli),
                gameStartTime: parseInt(data.gameStartTime),
                gameTime: parseInt(data.gameTime),
                // gameTimer : NodeJS.Timeout
                isGameTimeOver: data.isGameTimeOver == 'true' ? true : false,
                players: JSON.parse(data.players),
                contestId: parseInt(data.contestId),
                roomId: parseInt(data.roomId),
                noPlayerReachHome: parseInt(data.noPlayerReachHome),
                noOfContestWinner: parseInt(data.noOfContestWinner),
                gameType: parseInt(data.gameType),
                isPrivate: data.isPrivate == 'true' ? true : false,
                gameConfig: parseInt(data.gameConfig),
                isOnGameEndCallbackCalled: data.isOnGameEndCallbackCalled == 'true' ? true: false,
                gameMode: parseInt(data.gameMode),
                gameTurnRemaining: parseInt(data.gameTurnRemaining),
                totalTurn: parseInt(data.totalTurn),
                xFacLogId: parseInt(data.xFacLogId),
                xFacId: data.xFacId,
                xFacLevel: parseInt(data.xFacLevel)
            }
            console.log(" hgetall ",resp);
            return resp;
        }
        return null
        // let players : Array<any> = JSON.parse(data.players);
        // players = players.map(player=>{
        //     return {
        //         userId : player.userId,
        //         name : player.name,
        //         color : parseInt(player.color),
        //         pos  : parseInt(player.pos),
        //         pawnStack : JSON.parse(player.pawnStack),
        //         state  :player.state,
        //         hasKilled : player.hasKilled,
        //         skip : player.skip,
        //         score : player.SCORE,
        //         rank : player.rank,
        //         sixers : player.sixers,
        //         initPosition : player.initPosition
        //     }
        // });

    }
    public async hmget(gameId: string, keys: string) {
        const data = await this.redisClient.hmget(this.gameKey(gameId),keys);
        if (!data) return null;
        if (!data[0]) return null;
        const result: any = {};
        const fields = keys.split(",");
        for (let index: number = 0; index < data.length; index++) {
            result[fields[index]] = data[index];
        }
        return result;
    }
    public async hset(gameId: string, key: string, value: string, expire: number = 0) {
        return this.redisClient.pipeline().hset(this.gameKey(gameId), key, value).expire(this.gameKey(gameId), expire).exec();
    }
    public async hmset(gameId: string, data: any, expire: number = 0) {
        // console.log("\n hmset data ", data);
        try {
            const resp =  await this.redisClient.pipeline().hmset(this.gameKey(gameId), data).expire(this.gameKey(gameId), expire).exec();
            console.log("resp ", resp);
        } catch (error) {
            console.error("error in hmset", error);
        }
    }

    get INSTANCE(){
        return this.redisClient
    }
}