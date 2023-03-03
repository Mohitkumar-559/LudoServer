import * as socketIO from 'socket.io'
import { IUser } from './user.model'
import { GameState, Ludo } from '@data/game'
import { TableManager } from '@data/table'
import { BaseHttpResponse } from '@lib/base.http.response'
import { ExitReason, PlayerOpts, PlayerState, PlayerType } from '..'
import { GameServer } from '@web/application'
import { ServerService } from '@api/services/server.service'
import { ERROR_CODE } from '@logic/exceptions/error.dto'
import { gameLog } from '@lib/logger'
import { BadRequest } from '@logic/exceptions'
import { XFac } from '@data/xfac/xfac'
import { MSG_STATUS, RabbitMQ } from '@data/queue.context'
import { GamePriority } from '@api/dto/contest.dto'
import { off } from 'process'
import ContestService from '@api/services/contest.service'
const WAITING_TIME = Number(process.env.WAITING_TIME);
export class User {
    private userId: string
    private name: string
    private did: string
    private mid: number;
    private referCode: string;
    private waitTimer: number;
    private socket: socketIO.Socket
    private waitingTimer: NodeJS.Timeout
    public ludo: Ludo
    private playerType: PlayerType;
    public xfac: XFac
    constructor(socket: socketIO.Socket, user: IUser, xfac: XFac = null) {
        this.userId = user._id;
        this.name = user.name;
        this.did = user.did;
        this.mid = user.mid;
        this.referCode = user.referCode
        this.waitTimer = WAITING_TIME;
        this.playerType = xfac ? PlayerType.XFAC : PlayerType.HUMAN;
        this.xfac = xfac;
        socket ? this.initSocketEvents(socket) : null;
    }
    private initSocketEvents(socket: socketIO.Socket) {
        this.socket = socket;
        this.socket.on("rollDice", this.onRollDice.bind(this));
        this.socket.on("movePawn", this.onMovePawn.bind(this));
        this.socket.on("exitGame", this.onExitGame.bind(this));
        this.socket.on("gameSync", this.onGameSyncV2.bind(this));
        this.socket.on("pingPong", this.onPingPong.bind(this));
        this.socket.on("disconnect", this.onDisconnect.bind(this));
        this.socket.on("disconnecting", this.onDisconnecting.bind(this));
        this.socket.on("getRoom", this.onGetRoom.bind(this));
        this.socket.on('joinGame', this.onJoinGame.bind(this));
        this.socket.on('gameEntry', this.onGameEntry.bind(this));
        this.socket.on('sendEmoji', this.onSendEmoji.bind(this));
        this.socket.on('diceStack', this.onGetDiceStack.bind(this));
        this.socket.on('appDisconnect', this.onAppDisconnect.bind(this));
    }

    private startWaitingTimeout(time: number = 0) {
        this.waitTimer = time || this.waitTimer
        this.waitingTimer = setTimeout(this.onWaitingTimeout.bind(this), this.waitTimer);
    }

    private clearTimeout() {
        clearTimeout(this.waitingTimer);
    }
    private async onPingPong(body: any, callback: any) {
        console.log("onPingPong ", body);
        const clientTs = body.ts;
        if (callback) {
            callback({ ts: Date.now() });
        }
    }

    private async onDisconnect(reason: any) {
        try {
            console.log(this.name, 'disconnect');
            this.ludo?.log("\n user onDisconnect  reason ", this.name, reason);
            let remainingPlayerOnServer = GameServer.Instance.removePlayer(this.userId);
            if (this.ludo) {
                if (this.ludo.isFinished()) {
                    this.ludo.log('User disconnect and we removing game from memory ->', this.name, this.ludo.ID)
                    console.log("table id ", this.ludo.ID);
                    TableManager.deleteTableFromMap(this.ludo.ID);
                    TableManager.removeTableFromRunningGroup(this.ludo.ID);
                    this.ludo = null;
                } else if (this.ludo.isWaiting()) {
                    let ludo = this.ludo
                    // let resp = this.removeFromGameLobby()
                    ludo.log('User disconeect while game is in waiting', ludo.ID, this.name);
                }
                this.ludo?.log('Remaining player on sserve', remainingPlayerOnServer);

            }
            GameServer.Instance.UserCount.dec();

        } catch (error) {
            console.error(error);

        }
    }

    private async onAppDisconnect(body: any, callback: any){
        let resp = new BaseHttpResponse({}, "", 200, this.ludo?.ID)
        const gameId = body?.gameId || body?.tableId || "";
        try{
            gameLog(gameId, 'user app disconnecting', body?.reason)
            console.log('App is disconecting', body?.reason, gameId)

        } catch(err){
            console.error('Error in onAppDisconnect', err)
            gameLog(gameId,'Error in onAppDisconnect', err)
        }
        callback(resp)
    }

    private async onDisconnecting(reason: any) {
        console.log('User is disconnecting')
        this.ludo?.log(`${this.name} is disconnecting`, reason);
    }
    
    private async onGameSyncV2(body: any, callback: any) {
        gameLog(body.gameId, `Sync req come from ${this.name}`, body);
        const gameId = body.gameId || body.tableId || "";
        let ludo = this.ludo || TableManager.getTableFromMemory(gameId) || await TableManager.fetchTableStateRedis(gameId);
        ludo?.log('Ludo object on game sync', ludo)
        let resp: any;
        if (!ludo) {
            resp = new BaseHttpResponse({}, "No Opponent Found", ERROR_CODE.GAME_ENDED, this.ludo?.ID);
        } else if (ludo.ID != gameId) {
            resp = new BaseHttpResponse({}, "Invalid Game Id", ERROR_CODE.DEFAULT, this.ludo?.ID);
        }
        else if (ludo.isFinished()) {
            resp = new BaseHttpResponse({}, "Game Is Finished", ERROR_CODE.GAME_ENDED, this.ludo?.ID);
        } else if(ludo.isDestroyed()){
            resp = new BaseHttpResponse({}, "No Opponent Found", ERROR_CODE.GAME_ENDED, this.ludo?.ID);
        }else if (ludo.isExpired()) {
            ludo.setState(GameState.DESTROYED);
            ludo.destroyRoom()
            resp = new BaseHttpResponse({}, "No Opponent Found", ERROR_CODE.NO_OPPONENT_FOUND, this.ludo?.ID);
        } 
        // else if (!ludo.isPlayerExist(this.did)) {
        //     resp = new BaseHttpResponse({}, "No Opponent found", ERROR_CODE.NO_OPPONENT_FOUND, this.ludo?.ID);
        // }
        else if (ludo) {
            // if (ludo.isFinished()) {
            //     const data = ludo.onGameSync(this.userId);
            //     resp = new BaseHttpResponse(data, null, 200, this.ludo?.ID);
            //     TableManager.deleteTableFromMap(ludo.ID)
            // } else {
            const data = ludo.onGameSync(this.userId);
            resp = new BaseHttpResponse(data, null, 200, this.ludo?.ID);
            this.joinRoom(ludo.ID);
            this.ludo = ludo;
            // }

        } else {
            resp = new BaseHttpResponse({}, "No game found", ERROR_CODE.DEFAULT, this.ludo?.ID);
        }
        gameLog(gameId, `${this.name} resp of sync is`, resp)
        return callback(resp);

        // if (!ludo || ludo.ID != gameId) {
        //     let error = new BaseHttpResponse({}, "Game is ended", ERROR_CODE.GAME_ENDED, this.ludo?.ID);
        //     gameLog(gameId, `${this.name} resp of sync is`, error)
        //     return callback(error);
        // } else if (ludo.isDestroyed() || !ludo.isPlayerExist(this.did)) {
        //     let error = new BaseHttpResponse({}, "No Room found", ERROR_CODE.DEFAULT, this.ludo?.ID);
        //     gameLog(gameId, `${this.name} resp of sync is`, error)
        //     return callback(error);
        // } else if (ludo.isExpired()) {
        //     ludo.setState(GameState.DESTROYED);
        //     ludo.destroyRoom()
        //     let error = new BaseHttpResponse({}, "No Opponent found", ERROR_CODE.NO_OPPONENT_FOUND, this.ludo?.ID);
        //     gameLog(gameId, `${this.name} resp of sync is destroying game`, error)
        //     return callback(error);
        // } else if (ludo) {
        //     const data = ludo.onGameSync(this.userId);
        //     const resp = new BaseHttpResponse(data, null, 200, this.ludo?.ID);
        //     this.joinRoom(ludo.ID);
        //     this.ludo = ludo;
        //     this.ludo.log(`On game sync of ${this.name} from redis=>`, resp)
        //     return callback(resp);
        // } else {
        //     let error = new BaseHttpResponse({}, "No game found", ERROR_CODE.DEFAULT, this.ludo?.ID);
        //     gameLog(gameId, `${this.name} resp of sync is`, error)
        //     return callback(error);
        // }

    }
    private async onJoinGame(body: any, callback: any) {
        gameLog(body.gameId, `Join game req come from ${this.name}`, body);
        const gameId = body.gameId || body.tableId || "";
        const maxWaitingTime = body.gameServerTimeoutIn || WAITING_TIME;
        let ludoObject = TableManager.getTableFromMemory(gameId);
        gameLog(body.gameId, `Join game req found game in memory for ${this.name}`, ludoObject);

        if (!ludoObject) {
            ludoObject = await TableManager.fetchTableStateRedis(gameId);
        }
        gameLog(body.gameId, `Join game req found game in redis for ${this.name}`, ludoObject);
        if (!ludoObject) {
            let gameStatusOnRabbitMq = await RabbitMQ.getMsgStatus(gameId);
            if (gameStatusOnRabbitMq == MSG_STATUS.CREATED || gameStatusOnRabbitMq == MSG_STATUS.RECEIVED) {
                let resp = new BaseHttpResponse({ tryAfter: 5 }, "Try after sometime", ERROR_CODE.RETRY, this.ludo?.ID);
                return callback(resp);
            }
        } else if (ludoObject.isRunning() || ludoObject.isWaiting()) {
            this.ludo = ludoObject;
            let data: any = this.ludo.onGameSync(this.userId);
            data['syncAfter'] = 5000;
            console.log('Data on join game', data)
            const resp = new BaseHttpResponse(data, null, 200, this.ludo?.ID);
            console.log("ludoObject ", this.ludo);
            this.joinRoom(this.ludo.ID);
            this.ludo.log(`On game join of ${this.name} resp=>`, resp)
            this.startWaitingTimeout(maxWaitingTime - 7000);
            return callback(resp);
        } else if (ludoObject.isFinished() || ludoObject.isDestroyed()) {
            
            return callback(new BaseHttpResponse({}, "Game Is Finsihed", ERROR_CODE.GAME_ENDED, this.ludo?.ID));
        }

        let error = new BaseHttpResponse({}, "No Game Found", ERROR_CODE.DEFAULT, this.ludo?.ID);
        return callback(error);
    }
    private async onExitGame(body: any, callback: any) {

        const gameId: string = body.gameId || "";
        gameLog('common', "onExitGame event come from : ", this.name, body);
        if (this.ludo && this.ludo.isRunning()) {
            this.ludo.log('OnExit event come from=>', this.name);
            const data = await this.ludo.onExitGame(this.userId, PlayerState.EXIT, ExitReason.GAME_EXIT);

            const resp = new BaseHttpResponse(data, null, 200, this.ludo?.ID);
            this.ludo.log("onExitGame ", resp);
            callback(resp);
            // this.ludo.log(`OnExit resp=>`, resp)
            // GameServer.Instance.socketServer.emitToSocketRoom(this.ludo.ID, "exitGame", resp);
            this.ludo.log('Removing player from socket room on Gameexit', this.userId);
            this.leaveRoom(this.ludo.ID)

            // if(data.state != GameState.FINISHED){
            //     this.ludo?.log(`Send rollDice on playerexit ${this.name}`, resp);
            //     GameServer.Instance.socketServer.emitToSocketRoom(this.ludo.ID, "rollDice", resp);
            // }
        }
    }
    public async onRollDice(body: any, callback: any) {
        try {
            console.log("\n onRollDice Making body ", body);
            this.ludo.log(`Role dice event come from ${this.name} =>`, body);
            console.log("\n dice value ", body.diceValue);
            console.log("\n gameid value ", body.gameId);
            const dv: number = body.diceValue;
            const rollResponse = await this.ludo.onRollDice(this.userId, dv);
            console.log("\n onRollDice response ", rollResponse);
            const resp = new BaseHttpResponse(rollResponse, null, 200, this.ludo?.ID);
            callback(resp);
            this.ludo.log('rolldice resp=>', rollResponse);
            // console.log("\n onRollDice Making resp ", resp);
            GameServer.Instance.socketServer.emitToSocketRoom(this.ludo.ID, "rollDice", resp);
            return resp
        } catch (error) {
            console.log(error);
            const resp = new BaseHttpResponse(null, JSON.stringify(error), 400, this.ludo?.ID);
            this.ludo?.log('Error on rollDice=>', resp)
            callback(resp)
        }
    }
    private async exitBeforeMatchMaking() {
        if (this.ludo && this.ludo.isRunning()) {
            await this.ludo.onExitGame(this.userId, PlayerState.AUTOEXIT, ExitReason.EXIT_BEFORE_MATCH_MAKING);
            // this.ludo = null;
        }
    }
    public async onMovePawn(body: any, callback: any) {
        try {
            console.log("\n \n onMovePawn body, ", body);
            console.log("\n \n onMovePawn body type ", typeof body);
            this.ludo.log(`Move pawn event come from ${this.name} =>`, body);
            const pawnIndex = body.pawnIndex || 0;
            const playerPos = body.playerPos;
            const diceValueIndex = body.diceValueIndex || 0;
            if (!this.ludo) {
                return;
            }
            const moveResponse = await this.ludo.onMovePawn(this.userId, pawnIndex, diceValueIndex);
            console.log("onMovePawn", moveResponse);
            callback(moveResponse);
        } catch (error) {
            console.log(error);
            const resp = new BaseHttpResponse(null, JSON.stringify(error), 400, this.ludo?.ID);
            this.ludo?.log('Error on moveDice=>', resp)
            callback(resp)
        }
    }
    private async onGetRoom(body: any, callback: any) {
        var resp = {}
        if (this.ludo && this.ludo.isRunning()) {

            resp = {
                _id: this.ludo.ID
            }
            this.ludo.log('User hit getRoom', resp)
        }
        console.log('Sending resp for getRoom event', resp)

        let httpResp = new BaseHttpResponse(resp, null, 200, this.ludo?.ID)
        callback(httpResp);
        this.send("getRoom", resp);
        return

    }
    private async onGetDiceStack(body: any, callback: any) {
        let gameId = body.gameId;
        let resp = {};
        if (this.ludo && this.ludo.ID == gameId) {
            resp = { diceStack: this.ludo.getPlayerDiceStack(this.userId) }
        }
        callback(new BaseHttpResponse(resp, null, 200, this.ludo.ID))
    }
    private async onGameEntry(body: any, callback: any) {
        const gameId = body.gameId
        if (this.ludo && this.ludo.ID == gameId) {
            await this.ludo.logGameEntry(this.userId);
            callback(new BaseHttpResponse(null, 'Success', 200, this.ludo.ID));
            return
        }
        callback(new BaseHttpResponse({}, "Something went wrong", ERROR_CODE.DEFAULT, this.ludo?.ID));
        return



    }
    public async onSendEmoji(body: any, callback: any) {
        this.ludo?.log(`Send emoji fire from ${this.name}`, body)
        let resp = new BaseHttpResponse(body, null, 200, this.ludo?.ID)
        this.emitInRoom(true, this.ludo?.ID, 'sendEmoji', resp);
        this.ludo.sendEmoji(body.messageId, this.playerOpts.did);
        callback(resp);
    }
    private emitInRoom(toAll: boolean, roomId: string, eventName: string, resp: any): boolean {
        if (toAll) {
            GameServer.Instance.socketServer.emitToSocketRoom(roomId, eventName, resp);
            return true;
        }
        else {
            if (this.isOnline()) {
                this.socket.to(roomId).emit(eventName, resp);
            }
            else {
                GameServer.Instance.socketServer.emitToSocketRoom(roomId, eventName, resp);
            }
            return true;
        }
    }
    public get playerOpts(): PlayerOpts {
        return {
            _id: this.userId,
            name: this.name,
            did: this.did,
            mid: this.mid,
            referCode: this.referCode,
            playerType: this.playerType,
            xfac: this.xfac
        }
    }
    private joinRoom(id: string) {
        this.socket.join(id);
    }

    public leaveRoom(id: string) {
        this.socket.leave(id)
    }
    public onUpdatePlayer(userId: string, socket: socketIO.Socket, user: IUser) {
        this.userId = userId;
        this.name = user.name;
        this.did = user.did;
        this.initSocketEvents(socket);
        console.log("\n \n On socket Reconnect ....Game Id ", this.ludo?.ID);
    }
    public isOnline(): Boolean {
        return (this.socket?.connected == true) ? true : false;
    }
    public playerInfo(): any {
        return {
            userId: this.userId,
            name: this.name
        }
    }

    private async onWaitingTimeout() {
        // return
        this.ludo?.log('Player wait timeout', this.userId)
        if (this.ludo && !this.ludo.IS_FULL) {
            let ludo = this.ludo;
            this.ludo.log('On waiting timeout contgitest data', this.ludo.gameConfig);
            if (this.ludo.gameConfig == GamePriority.USER_FIRST) {
                this.ludo?.log('Creating xfac and joining him in match');
                try {
                    let xfac = new XFac(this.ludo);
                    xfac.joinMatch(this.mid)
                    return
                } catch (err) {
                    console.log(err)
                    this.ludo?.log('Error in creating xfac', err);
                }

            } else{
                await ContestService.Instance.sendNoOpponentLog(this.mid.toString(), ludo.CONTEST_ID)
            }

            ludo.log('Sending wait timeout')
            const resp = new BaseHttpResponse(null, null, 200, this.ludo?.ID);
            this.send('onWaitingTimeout', resp);
            this.ludo.setState(GameState.DESTROYED);
            this.ludo.destroyRoom();

        }
    }

    private removeFromGameLobby() {
        let resp = this.ludo.playerExitFromLobby(this.userId)
        if (resp) {
            // this.ludo.log(`Decrease counter for contest - ${this.ludo.CONTEST_ID} and on leaving user - ${this.userId}`)
            // GameServer.Instance.ContestMethods.incContestCounter(this.ludo.CONTEST_ID, -1);
            this.leaveRoom(this.ludo.ID);
            this.ludo = null;
        }
        return resp
    }

    private send(eventName: string, resp: any) {
        this.socket.emit(eventName, resp);
    }
}