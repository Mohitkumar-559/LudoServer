import { gameLog } from '@lib/logger'
import client, { Connection, Channel } from 'amqplib'
import UserService from "@api/services/user.service";
import { IUser } from './user';
import { GameTicketData } from '@api/dto/contest.dto';
import { RedisKeys } from 'redis/helpers/enums/redis.keys';
import { GameServer } from '@web/application';
import { RedisTimeout } from 'redis/helpers/enums/redis.dto';
import { GameIds } from './game';

export enum MSG_STATUS {
    CREATED = 1,
    RECEIVED = 2,
    PROCESSED = 3,
    ERROR = 4,
    NOT_FOUND = 5
}

export class RabbitMQ {
    private _connection: Connection
    private _winningChannel: Channel
    private _logChannel: Channel
    private WINNING_GAME_QUEUE = 'oneto11-queue-DeclareLudoResult'
    private LOG_GAME_QUEUE = 'oneto11-queue-CreateLudoEventLog'
    private GAME_JOIN_QUEUE = `oneto11-queue-NewLudoJoinGame`

    public constructor() {
        this.setupConnection()
    }

    private async setupConnection() {
        try {
            this._connection = await client.connect(
                process.env.RABBITMQ_URL
            )
            this._connection.on('close', ()=>{
                console.log('Connection close try reconnecting');
                setTimeout(this.setupConnection, 1000)
            })
            this._winningChannel = await this._connection.createChannel();
            await this._winningChannel.assertQueue(this.WINNING_GAME_QUEUE);
            this._logChannel = await this._connection.createChannel();
            await this._logChannel.assertQueue(this.LOG_GAME_QUEUE);
            await this.registerListeners();
            console.log('RabbitMQ Connected')
        } catch (err) {
            console.log('Error while connecting to RabbitMQ', err)
        }
    }

    public async pushToWinningQueue(msg: any): Promise<any> {
        try {
            gameLog('rabbitmq-win-queue', 'Winning data in rabbitmQ', msg);
            const msgBuffer = Buffer.from(JSON.stringify(msg));
            
            const resp = this._winningChannel.sendToQueue(this.WINNING_GAME_QUEUE, msgBuffer);
            console.log(resp);
            return resp
        } catch (err) {
            gameLog('rabbitmq-win-queue', 'Error in winning data', msg, err)
            return false
        }
    }

    public async pushToLogQueue(msg: any): Promise<any> {
        try {
            gameLog('rabbitmq-log-queue', 'Log data', msg)
            const msgBuffer = Buffer.from(JSON.stringify(msg));
            
            const resp = this._logChannel.sendToQueue(this.LOG_GAME_QUEUE, msgBuffer);
            console.log(resp)
            return resp
        } catch (err) {
            gameLog('rabbitmq-log-queue', 'Error in pushing log', msg, err)
            return false
        }
    }

    public async registerListeners(){
        await this.joinGameListener();
    }

    public async joinGameListener(){
        const channel = await this._connection.createChannel()
        await channel.assertQueue(this.GAME_JOIN_QUEUE);
        // TODO: Find optimal number for prefetch refer stackoverflow
        channel.prefetch(10);
        console.log('Adding listner for', this.GAME_JOIN_QUEUE);
        const userService = UserService.Instance;
        let resp = await channel.consume(this.GAME_JOIN_QUEUE, async (msg)=>{
            const data = JSON.parse(msg.content.toString());
            const user: IUser = data.user
            const ticket: GameTicketData = data.ticket
            RabbitMQ.addMsgStatusOnRedis(ticket.gameId, MSG_STATUS.RECEIVED)
            // await timeout(10000)
            console.log('Processing msg ', data, msg.fields.deliveryTag)
            gameLog('joinGame','Processing msg ', data, msg.fields.deliveryTag);
            await userService.joinGame(user, ticket);
            gameLog('joinGame', 'Done process msg ', msg.fields.deliveryTag);
            channel.ack(msg);
            RabbitMQ.addMsgStatusOnRedis(ticket.gameId, MSG_STATUS.PROCESSED)
        });
    }

    public static async getMsgStatus(msgId: string){
        let redisKey = RedisKeys.getRabbitMqMsgKey(msgId);
        let msgStatus = await GameServer.Instance.REDIS.INSTANCE.get(redisKey);
        if(msgStatus){
            return parseInt(msgStatus)
        }
        return MSG_STATUS.NOT_FOUND
    }

    public static async addMsgStatusOnRedis(msgId: string, status: MSG_STATUS){
        let redisKey = RedisKeys.getRabbitMqMsgKey(msgId);
        return await GameServer.Instance.REDIS.INSTANCE.pipeline().set(redisKey, status).expire(redisKey, RedisTimeout.MIN_15).exec();
    }
}

function timeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}