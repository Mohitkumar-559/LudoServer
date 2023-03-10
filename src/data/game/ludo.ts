import { ServerService } from '@api/services/server.service';
import { Player, PlayerOpts, PlayerState, ExitReason } from '@data/player';
import { BaseHttpResponse } from '@lib/base.http.response';
import { GameServer } from '@web/application';
import { ContestWinnerRequest, PrivateTransactionTokenRequest, TransactionTokenRequest } from 'models/request/Request';
import { JoinContestResponse } from 'models/response/Response';
import { GameMode, GameOpts, GamePhase, GameState, GameType, GameWinningData, TURN_SKIP_REASON, WINNING_POSITION } from './game.model';
import { isValidPawnPosition, isSafePosition } from './path';
import { gameLog } from '@lib/logger'
import { Table } from './table';
import { ContestData, GamePriority } from '@api/dto/contest.dto'
import { GAME_TYPES, TableManager } from '@data/table';
import { XFac } from '@data/xfac/xfac';
import { sendGameEndEvent } from './ludo.utils';
const TURN_TIME = 13000;
const GAME_TIME = 60000;
const DELAY_IN_GAME_END = 2000;
const DELAY_IN_GAME_START = 5000;
const DELAY_IN_PRE_GAME_START = 1000;
const TOTAl_GAME_TURNS = 5;

export class Ludo extends Table {
    private phase: number // roll dice, pawnMove
    private diceValue: number // 6
    private rolledValues: Array<number> // [6,3]
    // private rollTime: number
    // private moveTime: number
    private turnTime: number
    private timeout: NodeJS.Timeout
    private lastTurnTimeMilli: number
    private gameStartTime: number
    public gameTime: number
    private gameTimer: NodeJS.Timeout
    private isGameTimeOver: boolean
    public roomId: number;
    private noOfContestWinner: number;
    private noPlayerReachHome: number;
    private gameType: GameType;
    private gameMode: GameMode;
    private gameTurnRemaining: number;
    private totalTurn: number;
    public xFacLogId: number;
    

    private isOnGameEndCallbackCalled: boolean
    private isPrivate: boolean;
    public gameConfig: GamePriority;
    public constructor(opts: any) {
        super(opts);
        this.lastTurnTimeMilli = 0;
        this.rolledValues = [];
        this.phase = GamePhase.ROLL_DICE;
        // this.rollTime = ROLL_TIME;
        // this.moveTime = MOVE_TIME;
        this.turnTime = opts.turnTime || TURN_TIME
        this.gameTime = opts.gameTime || GAME_TIME;
        this.gameStartTime = Date.now();
        this.isGameTimeOver = false;
        this.isOnGameEndCallbackCalled = false
        this.noPlayerReachHome = 0
        this.gameType = GameType.NORMAL
        this.isPrivate = opts.isPrivate || false
        this.gameConfig = opts.gameConfig;
        this.gameMode = opts.gameMode || GameMode.TIME_BASED;
        this.gameTurnRemaining = opts.gameTurnRemaining || TOTAl_GAME_TURNS;
        this.totalTurn = opts.gameTurnRemaining || TOTAl_GAME_TURNS;
        this.xFacLogId = opts.xFacLogId
        this.players = opts.players ? opts.players.map((p: any) => { const player = new Player(p); return player; }) : []

        // this.startGameCountDown();
    }
    public initTableOnRestart(opts: any) {
        this._id = opts._id;
        this.capacity = opts.capacity;
        this.xFacLogId = opts.xFacLogId
        this.xFacId = opts.xFacId,
        this.xFacLevel = opts.xFacLevel
        this.players = opts.players.map((p: any) => { const player = new Player(p); player.initOnRestart(p, this); return player; });
        this.state = opts.state;
        this.isFull = opts.isFull;
        this.turnIndex = opts.turnIndex;

        this.lastTurnTimeMilli = opts.lastTurnTimeMilli;
        this.phase = opts.phase;
        this.rolledValues = this.phase == GamePhase.MOVE_PAWN ? [opts.diceValue] : [];
        // this.rollTime = ROLL_TIME;
        // this.moveTime = MOVE_TIME;
        this.turnTime = opts.turnTime || TURN_TIME
        this.gameTime = opts.gameTime;
        this.gameStartTime = opts.gameStartTime;
        this.isGameTimeOver = opts.isGameTimeOver;
        this.roomId = opts.roomId;
        this.contestId = opts.contestId;
        this.isOnGameEndCallbackCalled = opts.isOnGameEndCallbackCalled
        this.noPlayerReachHome = opts.noPlayerReachHome;
        this.noOfContestWinner = opts.noOfContestWinner;
        this.gameType = opts.gameType || GameType.NORMAL;
        this.isPrivate = opts.isPrivate || false;
        this.gameConfig = opts.gameConfig;
        this.gameMode = opts.gameMode;
        this.gameTurnRemaining = opts.gameTurnRemaining
        this.totalTurn = opts.totalTurn
        this.log('common', 'Game state reload=>', this);
        this.reStartGameCountDown();
        this.restartTurnTimeout();

    }
    private startGameCountDown() {
        if (this.gameMode == GameMode.TIME_BASED) {
            this.gameTimer = setTimeout(this.onGameCountDownCallback.bind(this), this.gameTime);
        }

    }
    private reStartGameCountDown() {
        const timeRemaining = this.gameTime - (Date.now() - this.gameStartTime);
        if (this.gameMode == GameMode.TIME_BASED) {
            this.gameTimer = setTimeout(this.onGameCountDownCallback.bind(this), timeRemaining);
        }
    }
    private restartTurnTimeout() {
        const diff = Date.now() - this.lastTurnTimeMilli;
        let turnTimeRemaining = (diff > this.turnTime) ? this.turnTime : diff;
        this.startTurnPhaseTimer(turnTimeRemaining);

    }
    private onGameCountDownCallback() {
        this.log("\n \n \n Game time is over set isGameTimeOver=true\n \n \n ");
        console.log("\n \n \n GAME IS OVER \n \n \n ");
        this.isGameTimeOver = true;
        let remainingPlayer = this.remainingPlayerTurns();
        this.log("Remaining player", remainingPlayer)
        console.log("Remaining player", remainingPlayer)
        if (remainingPlayer && remainingPlayer.length > 0) {
            let resp = {
                remainingPlayers: remainingPlayer
            }
            let httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
            this.log(`Sending last round players on game count down`, resp);
            GameServer.Instance.socketServer.emitToSocketRoom(this.ID, "lastRound", httpResp);
        }
        this.log("End of onGameCountDownCallback", remainingPlayer)
        console.log("End of onGameCountDownCallback", remainingPlayer)
    }
    private async onGameCountDownTimeout() {
        this.log("\n Game End....coz of the timer");
        console.log("\n Game End....coz of the timer")
        this.state = GameState.FINISHED;
        const userPrizes = await this.getContestPrize();
        this.log(`User prizes are(onTimeout) - `, userPrizes)
        const players = this.players.map(p => p.playerInfo).sort((a, b) => b.score - a.score);
        players.forEach(player => {
            let isExitPlayer = player.isExitPlayer
            const rank = this.assignRank(player.userId, isExitPlayer);
            const getPlayer = this.currentPlayer(player.pos);
            let state = isExitPlayer ? player.state : PlayerState.WON
            this.log(`Updateing player state on gametimeout -`, getPlayer.ID, state, rank, userPrizes[getPlayer.MID])
            getPlayer.updatePlayerState(state, rank, userPrizes[getPlayer.MID]);
        });
        console.log("players ", players);
        console.log("OnGame Time over ...");
        clearTimeout(this.gameTimer);
        this.clearAllTimeouts();
        this.onGameEnd();
    }
    public getPlayerPos(): number {
        if (this.capacity == 2) {
            return (this.players.length * 2);
        }
        else {
            return this.players.length;
        }
    }
    public async join(playerOpts: PlayerOpts, color: number, contestData: ContestData, gameType: GameType = GameType.NORMAL): Promise<any> {
        let isRunning: boolean = false;
        let joiningSuccess: boolean = false;
        if (this.canJoin(playerOpts._id)) {
            // playerOpts.color = color;
            playerOpts.pos = this.getPlayerPos();
            playerOpts.totalGameWinners = this.getNoOfWinner(contestData);
            console.log("player pos ", playerOpts.pos);
            const newPlayer = new Player(playerOpts);
            this.players.push(newPlayer);
            this.gameType = gameType;
            isRunning = this.onFullTable();
            joiningSuccess = true
        }
        this.printPlayerArr();
        let resp = {
            _id: this._id,
            players: this.players.map(p => p.playerInfo),
            capacity: this.capacity,
            isFull: this.isFull,
            state: this.state,
            isRunning: isRunning,
            turnIndex: this.turnIndex,
            phase: this.phase,
            // rollTime: this.rollTime,
            // moveTime: this.moveTime,
            turnTime: this.turnTime,
            timeRemaining: -1,
            gameTime: this.gameTime,
            roomId: this.roomId,
            joiningSuccess: joiningSuccess,
            // waitingTime: contestData.GameStartInSeconds * 1000
        };
        if (resp.joiningSuccess == true) {
            const httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
            this.log(`Joining success of user ${playerOpts.name} call matchInit on room. Game is running ${isRunning}`, httpResp)
            this.emit(httpResp, 'matchInit')
            if (isRunning) {
                await this.onPreGameStart(contestData);
            }
        }
        return resp
    }
    private mongoStartGameData(): any {
        return {
            _id: this._id,
            state: this.state,
            startedAt: Date.now(),
            players: this.players.map(p => p.playerInfo),
        }
    }
    private redisStartGameData(): any {
        const resp = {
            _id: this._id,
            capacity: this.capacity,
            isFull: this.isFull,
            turnIndex: this.turnIndex,
            state: this.state,
            startedAt: Date.now(),
            phase: this.phase,
            diceValue: this.diceValue,
            rolledValues: this.rolledValues,
            turnTime: this.turnTime,
            lastTurnTimeMilli: this.lastTurnTimeMilli,
            gameStartTime: this.gameStartTime,
            gameTime: this.gameTime,
            isGameTimeOver: this.isGameTimeOver,
            roomId: this.roomId,
            contestId: this.CONTEST_ID,
            isOnGameEndCallbackCalled: this.isOnGameEndCallbackCalled,
            noPlayerReachHome: this.noPlayerReachHome,
            noOfContestWinner: this.noOfContestWinner,
            gameType: this.gameType,
            isPrivate: this.isPrivate,
            gameConfig: this.gameConfig,
            players: JSON.stringify(this.players.map(p => p.playerProperties())),
            gameMode: this.gameMode,
            gameTurnRemaining: this.gameTurnRemaining,
            xFacLogId: this.xFacLogId,
            totalTurn: this.totalTurn,
            xFacId: this.getXFacData().xFacId,
            xFacLevel: this.getXFacData().xFacLevel
        }
        // return JSON.stringify(resp);
        return resp;
    }
    private mongoLogGameData(userId: string): any {
        let resp: any = {
            _id: this._id,
            capacity: this.capacity,
            turnIndex: this.turnIndex,
            state: this.state,
            startedAt: Date.now(),
            phase: this.phase,
            diceValue: this.diceValue,
            rolledValues: this.rolledValues,
            playedBy: userId || this.getCurrentPlayerDID(),
            roomId: this.roomId,
            contestId: this.CONTEST_ID,
            gameType: this.gameType,
            gameMode: this.gameMode,
            players: this.players.map(p=> p.playerPropertiesLog())

        }

        //resp = JSON.stringify(resp);
        console.log(resp);
        return resp;
    }
    private redisSyncGameData(): any {
        const resp = {
            turnIndex: this.turnIndex,
            state: this.state,
            startedAt: Date.now(),
            phase: this.phase,
            diceValue: this.diceValue,
            rolledValues: this.rolledValues,
            // rollTime: this.rollTime,
            // moveTime: this.moveTime,
            turnTime: this.turnTime,
            lastTurnTimeMilli: this.lastTurnTimeMilli,
            gameTime: this.gameTime,
            isGameTimeOver: this.isGameTimeOver,
            contestId: this.CONTEST_ID,
            isOnGameEndCallbackCalled: this.isOnGameEndCallbackCalled,
            noPlayerReachHome: this.noPlayerReachHome,
            gameType: this.gameType,
            isPrivate: this.isPrivate,
            gameConfig: this.gameConfig,
            players: JSON.stringify(this.players.map(p => p.playerProperties())),
            gameMode: this.gameMode,
            gameTurnRemaining: this.gameTurnRemaining,
            xFacLogId: this.xFacLogId,
            xFacId: this.getXFacData().xFacId,
            xFacLevel: this.getXFacData().xFacLevel
        }
        gameLog('common', 'Game sync redis=>', resp)
        return resp;
    }
    private async onPreGameStart(contestData: ContestData) {
        try {
            const deductBalanceResponse: JoinContestResponse = await this.deductJoiningAmount(contestData);
            this.log(`Deductig balance before start game`, deductBalanceResponse, deductBalanceResponse.RoomId);
            await ServerService.Instance.addGame(deductBalanceResponse.RoomId.toString())
            this.roomId = deductBalanceResponse.RoomId
            this.noOfContestWinner = this.getNoOfWinner(contestData);


            const mongoData: any = this.mongoStartGameData();
            const redisData: any = this.redisStartGameData();
            this.sendLogInMongo('startGame');
            console.log("mongo data ", mongoData);
            const response = await GameServer.Instance.GameServices.createGameEntryOnStart(mongoData, redisData);
            console.log("resp after updating....", response);
            let resp = {
                _id: this._id,
                players: this.players.map(p => p.playerInfo),
                capacity: this.capacity,
                isFull: this.isFull,
                state: this.state,
                isRunning: this.isRunning(),
                turnIndex: this.turnIndex,
                phase: this.phase,
                turnTime: this.turnTime,
                timeRemaining: -1,
                gameTime: this.gameTime,
                roomId: this.roomId,
                // waitingTime: contestData.GameStartInSeconds * 1000,
                gameStartIn: DELAY_IN_GAME_START - DELAY_IN_PRE_GAME_START,
                gameMode: this.gameMode,
                gameTurnRemaining: this.gameTurnRemaining
            };
            const httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
            this.log(`Sending prestartgame event`, httpResp);
            setTimeout((httpResp) => {
                GameServer.Instance.socketServer.emitToSocketRoom(this.ID, 'preStartGame', httpResp);
            }, 1000, httpResp)
            // this.emit(httpResp, 'preStartGame')

            setTimeout(this.onGameStart.bind(this, contestData), DELAY_IN_GAME_START - DELAY_IN_PRE_GAME_START);
        } catch (err) {
            this.state = GameState.WAITING
            this.log(`Error while onGameStart and destroying game`, err)
            this.destroyRoom();
            throw err;
        }
    }
    private async onGameStart(contestData: ContestData) {
        try {
            this.state = GameState.RUNNING;
            this.gameStartTime = Date.now();
            this.lastTurnTimeMilli = Date.now();
            GameServer.Instance.GameCount.inc();
            this.startGameCountDown();
            this.startTurnPhaseTimer();
            let resp = {
                _id: this._id,
                players: this.players.map(p => p.playerInfo),
                capacity: this.capacity,
                isFull: this.isFull,
                state: this.state,
                isRunning: this.isRunning(),
                turnIndex: this.turnIndex,
                phase: this.phase,
                turnTime: this.turnTime,
                timeRemaining: -1,
                gameTime: this.gameTime,
                roomId: this.roomId,
                gameStartTime: this.gameStartTime,
                gameStartIn: DELAY_IN_GAME_START - DELAY_IN_PRE_GAME_START,
                gameMode: this.gameMode,
                gameTurnRemaining: this.gameTurnRemaining
            };
            const httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
            this.log('Sending startGame event ', httpResp);
            this.emit(httpResp, 'startGame')

        } catch (err) {
            this.state = GameState.WAITING
            console.log(err)
            this.log(`Error while onGameStart and destroying game`, err)
            this.destroyRoom();
            throw err;
        }
    }

    private async deductJoiningAmount(contestData: any) {
        let resp;
        if (this.isPrivate) {
            this.log('Call JoinPrivateContest for private room')
            resp = await GameServer.Instance.TransactionMethods.JoinPrivateContest(this.getPrivateRoomTransactionData(contestData.uniqueId, contestData.amt));
        } else {
            this.log('Call JoinContest for contest room')
            resp = await GameServer.Instance.TransactionMethods.JoinContest(this.getTransactionData())
            if(contestData.catid.toString() == process.env.GIVEAWAY_CAT_ID.toString()){
                let pIds = this.players.map((p)=>p.MID);
                await GameServer.Instance.ContestMethods.addGivewayRoom(pIds);
            }
        }
        // this.log('Deduct balance')
        return resp
    }

    private async onGameEnd() {
        const mongoData: any = this.mongoStartGameData();
        const redisData: any = this.redisStartGameData();
        this.sendLogInMongo('endGame');
        this.log("mongo data ", mongoData);
        const resp = await GameServer.Instance.GameServices.createGameEntryOnEnd(mongoData, redisData);
        console.log("resp after updating....", resp);


        if (!this.isOnGameEndCallbackCalled) {
            this.isOnGameEndCallbackCalled = true
            await ServerService.Instance.removeGame(this.roomId?.toString())
            GameServer.Instance.GameCount.dec();
        }
        // this.log(`Decrease counter for contest - ${this.CONTEST_ID} at - ${-(this.Capacity)}`)
        // await GameServer.Instance.ContestMethods.incContestCounter(this.CONTEST_ID, -(this.Capacity));


        let winningData = this.getWinningUserData()
        let ack = await GameServer.Instance.RabbitMQ.pushToWinningQueue(winningData)
        this.log('Winning data ack of rabit mq', ack, winningData)
        this.sendGameEndResp();


    }
    private sendGameEndResp() {
        const gameEndResp = {
            phase: this.phase,
            players: this.players.map(p => { const resp = p.playerInfo; console.log("player , ", resp); return resp; }),
            state: this.state,
            rolledValues: this.rolledValues,
            turnIndex: this.turnIndex,
            roomId: this.roomId,
            turnTime: this.turnTime
        }
        const httpResp = new BaseHttpResponse(gameEndResp, null, 200, this.ID, true)
        this.log('Set timout for gameEnd resp and destroy room');
        setTimeout(sendGameEndEvent, DELAY_IN_GAME_END, httpResp, this.ID);

        this.destroyRoom();

    }
    public onGameSync(playerId: string): any {
        const diff = Date.now() - this.lastTurnTimeMilli;
        const diff2 = Date.now() - this.gameStartTime;
        let timeRemaining = (diff > this.turnTime) ? this.turnTime : diff;
        let gameTimeRemain = (diff2 > this.gameTime) ? this.gameTime : diff2;
        timeRemaining = this.turnTime - timeRemaining;
        gameTimeRemain = this.gameTime - gameTimeRemain;

        console.log("Time Remaining...", timeRemaining);
        console.log("game time Remaining...", gameTimeRemain);

        return {
            _id: this.ID,
            phase: this.phase,
            players: this.players.map(p => p.playerInfo),
            state: this.state,
            rolledValues: this.rolledValues,
            turnIndex: this.turnIndex,
            turnTime: this.turnTime,
            capacity: this.capacity,
            timeRemaining: timeRemaining,
            gameTimeRemaining: gameTimeRemain,
            gameTime: this.gameTime,
            roomId: this.roomId ? this.roomId.toString() : '',
            gameStartTime: this.gameStartTime,
            gameTurnRemaining: this.gameTurnRemaining,
            gameMode: this.gameMode
        };
    }
    private canEndTheGame(): boolean {
        const playing = this.players.filter(p => p.isPlaying).length;
        if (playing == 1) {
            return true; // yes end the game 
        }
        return false; // dont end yet
    }
    private isGameOver(): boolean {
        const playerOver = this.canEndTheGame();
        return playerOver;
    }
    private assignRank(playerId: string, isExit: boolean): number {
        console.log("assignRank , playerid ", playerId);
        const data = this.players.filter(p => {
            console.log("p id player id ", p.ID, " - ", playerId);
            if (p.ID == playerId) {
                return p;
            }
        });
        console.log("data  ", data);
        if (data && data.length == 0) {
            const err = new Error();
            err.name = "1";
            err.message = "Invalid user found";
            throw err;
        }
        const player = data[0];
        if (player.RANK >= 0) {
            return player.RANK;
        }
        const ranks = this.players.map(p => p.RANK);
        console.log("ranks ", ranks);
        console.log("capcity ", this.capacity);
        if (isExit) {
            for (let i = this.capacity - 1; i >= 0; i--) {
                console.log("i ", i);
                const exist = ranks.includes(i);
                console.log("exist ", exist);
                if (exist == false) {
                    return i;
                }
                continue;
            }
        }
        else {
            for (let i = 0; i < this.capacity; i++) {
                console.log("i ", i);
                const exist = ranks.includes(i);
                console.log("exist ", exist);
                if (exist == false) {
                    return i;
                }
                continue;
            }
        }
    }
    public async onExitGame(playerId: string, playerState = PlayerState.EXIT, reason: number): Promise<any> {
        var resp = {}
        this.log("Player exit from game reason -", reason);
        const exitPlayer = this.players.filter(player => player.ID == playerId);
        if (exitPlayer && exitPlayer.length == 0) {
            console.error("Player Id doesnt exits ", playerId);
            return false
        }
        this.log(`Updateing player state on exit -`, playerState, exitPlayer[0].ID)
        const exit: boolean = exitPlayer[0].updatePlayerState(playerState);
        exitPlayer[0].removePawnFromBoard();
        const gameOver = this.isGameOver();
        console.log("exit gameOver gameOver ", gameOver);
        // Case when player exit and game over!
        if (gameOver) {
            this.log(`Game end because of exit reason - ${reason}`)
            this.state = GameState.FINISHED;
            const userPrizes = await this.getContestPrize();
            this.log(`User prizes are - `, userPrizes)
            const players = this.players.map(p => p.playerInfo).sort((a, b) => b.score - a.score);
            players.forEach(player => {
                let isExitPlayer = player.isExitPlayer
                const rank = this.assignRank(player.userId, isExitPlayer);
                console.log("exit rank rank ", rank);
                const getPlayer = this.currentPlayer(player.pos);
                let state = isExitPlayer ? player.state : PlayerState.WON
                this.log(`Updateing player state on game end on exit player -`, getPlayer.ID, state, rank, userPrizes[getPlayer.MID])
                getPlayer.updatePlayerState(state, rank, userPrizes[getPlayer.MID]);
            });
            await this.onGameEnd();
        }
        this.log('Player exit successfully', exitPlayer[0].ID)
        resp = {
            phase: this.phase,
            players: this.players.map(p => p.playerInfo),
            state: this.state,
            turnIndex: this.turnIndex,
            rolledValues: this.rolledValues,
            // rollTime: this.rollTime,
            // moveTime: this.moveTime
            turnTime: this.turnTime,
        }
        var httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
        GameServer.Instance.socketServer.emitToSocketRoom(this.ID, "exitGame", httpResp);

        // If player self exit and game not end than chanage turn also.
        if (reason == ExitReason.GAME_EXIT && !gameOver && this.turnIndex == exitPlayer[0].POS && !(await this.checkGameTimeOverCondition(playerId))) {
            this.log('Change turn in case of player self exit', exitPlayer[0].ID)
            
            this.changeTurn();

            resp = {
                autoMove: true,
                changeTurn: true,
                phase: this.phase,
                players: this.players.map(p => p.playerInfo),
                state: this.state,
                turnIndex: this.turnIndex,
                rolledValues: this.rolledValues,
                turnTime: this.turnTime,
                gameMode: this.gameMode,
                gameTurnRemaining: this.gameTurnRemaining
            }
            var httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
            this.log(`Send rollDice on playerexit ${exitPlayer[0].ID}`, httpResp);
            GameServer.Instance.socketServer.emitToSocketRoom(this.ID, "rollDice", httpResp);
        }

        this.sendLogInMongo('onPlayerExit', playerId);
        return resp
    }

    public playerExitFromLobby(playerId: string) {
        this.log('Check player can leave')
        if (this.canLeave(playerId)) {
            for (let index = 0; index < this.players.length; index++) {
                if (this.players[index].ID.toString() == playerId.toString()) {
                    this.players.splice(index, 1);
                    this.log('Remove player from list')
                    return true
                }
            }
        }
        return false
    }
    private printPlayerArr() {
        console.log("players info");
        this.players.forEach(player => {
            console.log("\n ", player.playerInfo);
        })
    }
    private clearAllTimeouts() {
        clearTimeout(this.timeout);
    }
    private async checkGameTimeOverCondition(playerId: string) {
        // const currentPlayer = this.players.find(p=>p.ID == playerId);
        if (!this.isGameTimeOver) return false;
        // const playerId = currentPlayer.ID;
        const playingMembers = this.players.filter(p => p.isPlaying || p.ID == playerId);
        if (playingMembers[playingMembers.length - 1].ID == playerId) {
            this.log('Game is over after giving all chances due to timeout')
            await this.onGameCountDownTimeout();
            return true;
        }
        return false;
    }
    private remainingPlayerTurns() {
        let players = [];
        for (let i = 0; i < this.players.length; i++) {
            if (i > this.turnIndex && this.players[i].isPlaying) {
                players.push(this.players[i].playerInfo);
            }
        }
        return players.length > 0 ? players : null;
    }
    public async onRollDice(playerId: string, dv: number): Promise<any> {
        this.log("User send custom dice value", dv);
        if (this.state !== GameState.RUNNING) {
            const error = new BaseHttpResponse(null, "Game not in running state !" + this.phase, 400, this.ID);
            throw error;
        };
        if (this.phase != GamePhase.ROLL_DICE) {
            const error = new BaseHttpResponse(null, "Invalid Phase" + this.phase, 400, this.ID);
            throw error;
        }
        const currentPlayer = this.getCurrentPlayer();
        if (currentPlayer.ID != playerId) {
            const error = new BaseHttpResponse(null, "Invalid User" + currentPlayer.ID, 400, this.ID);
            throw error;
        }

        currentPlayer.skipped(false);
        const diceValues = this.generateDv(currentPlayer, dv);
        let canMove = this.canMovePawn(currentPlayer.POS);
        console.log("can move ", canMove);
        // no  pawn to move
        if (canMove === false && !await this.checkGameTimeOverCondition(currentPlayer.ID)) {
            this.changeTurn();
            const resp = {
                changeTurn: true,
                phase: this.phase,
                players: this.players.map(p => p.playerInfo),
                state: this.state,
                turnIndex: this.turnIndex,
                rolledValues: diceValues,
                // rollTime: this.rollTime,
                // moveTime: this.moveTime,
                turnTime: this.turnTime,
                gameMode: this.gameMode,
                gameTurnRemaining: this.gameTurnRemaining
                // skip: {
                //     turnIndex: this.turnIndex,
                // }
            }
            this.sendLogInMongo('onRollDice', );
            this.log(`Player - ${currentPlayer.ID} turn change while rolling dice. Reason player canMove false`, currentPlayer)
            console.log("\n Change turn rolling phase for next player \n ");
            return resp;
        }
        else {
            console.log("\n Move pawn for same player \n ");
            if (diceValues[diceValues.length - 1] == 6) {
                const tripple = currentPlayer.sixCounter(true);
                if (tripple == 3 && !await this.checkGameTimeOverCondition(currentPlayer.ID)) {
                    currentPlayer.sixCounter(false);
                    this.changeTurn();
                    const resp = {
                        changeTurn: true,
                        phase: this.phase,
                        players: this.players.map(p => p.playerInfo),
                        state: this.state,
                        turnIndex: this.turnIndex,
                        rolledValues: diceValues,
                        // rollTime: this.rollTime,
                        // moveTime: this.moveTime,
                        turnTime: this.turnTime,
                        skip: {
                            turnIndex: this.turnIndex,
                            reason: TURN_SKIP_REASON.TRIPPLE_SIX
                        },
                        gameMode: this.gameMode,
                        gameTurnRemaining: this.gameTurnRemaining
                    }
                    this.sendLogInMongo('onRollDice', playerId);
                    this.log(`Player - ${currentPlayer.ID} turn change while rolling dice. Reason player has 3 six`, currentPlayer)
                    console.log("\n Change turn rfor tripple sixes \n ");
                    return resp;
                }
            }
            else {
                currentPlayer.sixCounter(false);
            }
            this.movingPhase();
            await this.gameSync()
            this.sendLogInMongo('onRollDice', playerId);
            return {
                phase: this.phase,
                players: this.players.map(p => p.playerInfo),
                state: this.state,
                rolledValues: this.rolledValues,
                turnIndex: this.turnIndex,
                turnTime: this.turnTime,
                gameMode: this.gameMode,
                gameTurnRemaining: this.gameTurnRemaining
            }
        }

    }
    private async handleAutoExit(currentPlayer: Player): Promise<any> {
        const missed = currentPlayer.skipped(true);
        if (missed >= 3) {
            const resp = await this.onExitGame(currentPlayer.ID, PlayerState.AUTOEXIT, ExitReason.TURN_SKIP_3);
            if (resp.state == GameState.FINISHED) {
                this.log(`Game end due to 3 skips count ${missed}`, currentPlayer.ID, resp)
                return true;
            }
        }

        return false;
    }

    private movingPhase() {
        // this.updateLastTurnTime();
        this.phase = GamePhase.MOVE_PAWN;
        // this.startMovingPhaseTimer();
    }
    private changeTurn() {
        console.log("\n \n ......Change Turn Called ..................start ");
        if (this.state !== GameState.RUNNING) {
            this.clearAllTimeouts();
            console.error("\n Game not in running state \n ", this.state);
            return;
        }
        let turnIndices: number;
        this.players.forEach((player, pindex) => {
            if (player.POS == this.turnIndex) {
                turnIndices = pindex;
            }
        })
        const nextTurnIndex = turnIndices + 1;
        const normalisedIndex = nextTurnIndex % this.players.length;
        console.log("\n \n normalisedIndex nextplayer ", normalisedIndex);
        const nextPlayer = this.players[normalisedIndex];
        this.log(`Changing turn from player ${this.turnIndex} to ${nextTurnIndex} = ${normalisedIndex}`)
        console.log("\n \n normalisedIndex nextplayer isplaying ", nextPlayer.isPlaying);

        this.turnIndex = nextPlayer.POS;
        console.log("turn Index ", this.turnIndex);
        console.log("\n ......Change Turn Called ..................end ");
        if (this.gameMode == GameMode.TURN_BASED && normalisedIndex == 0) {
            this.gameTurnRemaining -= 1;
            if (this.gameTurnRemaining <= 0) {
                this.onGameCountDownTimeout()
            }
        }
        if (!nextPlayer.isPlaying) {
            this.log(`changeTurn called on changeTurn bcz next player is not isPlaying`, nextPlayer)
            this.changeTurn();
        }
        this.rolledValues = [];
        this.turnPhase();

        let currentPlayer = this.getCurrentPlayer();
        if (currentPlayer.isXFac) {
            this.log('Currenplayer is xfac in change turn', currentPlayer)
            currentPlayer.xfac.makeMove();
        }
    }
    private updateLastTurnTime() {
        this.lastTurnTimeMilli = Date.now();
    }


    private startTurnPhaseTimer(turnTimeRemaining: number = null) {
        this.log("startTurnPhaseTimer : Starting Turn Phase Timer");
        this.clearAllTimeouts();
        this.timeout = setTimeout(this.onTurnPhaseTimeout.bind(this), turnTimeRemaining || this.turnTime);
    }

    private turnPhase() {
        this.updateLastTurnTime();
        this.phase = GamePhase.ROLL_DICE;
        this.startTurnPhaseTimer();
    }

    private async onTurnPhaseTimeout() {
        // if (this.phase !== GamePhase.ROLL_DICE) {
        //     console.log("onRollingPhaseTimeout : Cant clear time out as phase is not roll dice");
        // }
        const currentPlayer = this.getCurrentPlayer();
        currentPlayer.sixCounter(false);

        // currentPlayer.skipped(true);
        const flag = await this.handleAutoExit(currentPlayer);
        if (flag == true) return;
        console.log("onTurnPhaseTimeout : Clearing time-outs ");
        this.clearAllTimeouts();
        this.changeTurn();
        await this.checkGameTimeOverCondition(currentPlayer.ID);
        const resp = {
            autoMove: true,
            changeTurn: true,
            phase: this.phase,
            players: this.players.map(p => p.playerInfo),
            state: this.state,
            turnIndex: this.turnIndex,
            rolledValues: this.rolledValues,
            // rollTime: this.rollTime,
            // moveTime: this.moveTime,
            turnTime: this.turnTime,
            skip: {
                turnIndex: currentPlayer.POS,
                reason: TURN_SKIP_REASON.TURN_TIMEOUT
            },
            gameMode: this.gameMode,
            gameTurnRemaining: this.gameTurnRemaining
        }

        const httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
        this.sendLogInMongo('onRollingTimeout', currentPlayer.ID);
        this.log(`changeTurn called on rollingPhaseTimeout of player - ${currentPlayer.ID}`, httpResp)
        this.log(`Rolling phase timeout for ${currentPlayer.ID} call rollDice`, httpResp)
        GameServer.Instance.socketServer.emitToSocketRoom(this.ID, "rollDice", httpResp);

    }
    private generateDv(player: Player, dv: number): any {
        if (!dv) {
            if (this.gameType == GameType.XFAC_HARD) {
                if (player.isXFac) {
                    dv = player.xfac.getDv(player);
                } else {
                    dv = XFac.getNonKillValue(player, this);
                }
            } else if (this.gameType == GameType.XFAC_MEDIUM) {
                if (!player.isXFac) {
                    dv = XFac.getNonKillValue(player, this);
                }
            } else if (this.gameType == GameType.XFAC_EASY && Number(this.CONTEST_ID) == 1) {
                if (player.isXFac) {
                    dv = player.xfac.getDv(player);
                }
            }
            dv = dv || this.getDv(player);
        }
        this.diceValue = dv;
        this.rolledValues.push(this.diceValue);
        return this.rolledValues;
    }

    private generateRandom(n: number) {
        return Array.from({ length: n }, () => Math.ceil(Math.random() * 6));
    }
    private generateRandomWeightage(n: number, weightage: number = 100) {
        let randomArray = []
        for (let i = 0; i < n; i++) {
            let randomPercent = Math.ceil(Math.random() * 100);
            if (randomPercent > weightage) {
                randomArray.push(Math.floor(Math.random() * (6 - 4 + 1) + 4))
            } else {
                randomArray.push(Math.ceil(Math.random() * 6))
            }
        }
        return randomArray;
    }
    private getDv(player: Player) {
        let dv = player.DiceValue;
        if (dv == undefined) {
            this.log('User dv stack empty create new values')
            // If exiting value empty then generate new stack of value then pop the value
            this.generateDiceValue();
            dv = player.DiceValue;
        }
        this.log("Generate dv ", dv);

        return dv;

    }

    public generateDiceValue() {
        let MAX_STACK_SIZE = 10;
        let randomStack = this.generateRandomWeightage(MAX_STACK_SIZE);
        this.log('Random stack is ', randomStack);
        this.players.forEach((player) => player.DiceValueStack = this.shuffle(randomStack));
    }
    private shuffle(array: Array<number>) {
        let currentIndex = array.length, randomIndex;

        // While there remain elements to shuffle.
        while (currentIndex != 0) {
            // Pick a remaining element.
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;

            // And swap it with the current element.
            [array[currentIndex], array[randomIndex]] = [
                array[randomIndex], array[currentIndex]];
        }

        return array;
    }
    private currentTurnPlayer(playerId: string): Player {
        console.log("\n currentTurnPlayer Turn of ", this.turnIndex);
        console.log("\n currentTurnPlayer playerId  ", playerId);
        const index = this.players.findIndex(p => p.ID == playerId);
        if (index == -1) {
            console.log("\n currentTurnPlayer players array  ", this.printPlayerArr());
        }
        console.log("\n Turn input by ", index);
        return this.players[index];
        if (this.phase != GamePhase.ROLL_DICE) throw Error("Invalid Phase");
        if (this.turnIndex != index) throw Error("Not your Turn");
        return this.players[index];
    }
    private currentPlayer(playerIndex: number): Player {
        for (let i = 0; i < this.players.length; i++) {
            if (this.players[i].POS == playerIndex) {
                return this.players[i];
            }
        }
        // return this.players[playerIndex];
    }
    private getPlayerById(playerId: string) {
        for (let i = 0; i < this.players.length; i++) {
            if (this.players[i].ID == playerId) {
                return this.players[i];
            }
        }
    }
    public canMovePawn(playerIndex: number): boolean {
        const currentPlayer: Player = this.currentPlayer(playerIndex);
        return this.rolledValues.some(value => {
            return currentPlayer.canMoveAnyPawn(value);
        });
    }
    // data : dicevalue,pawnIndex
    // logic : if empty dv: changeTurn, else- validateCoinPos
    // validate : isValidPos(pawnIndex,diceValue) -> yes-updateCoinPos reutrn ; else if (any movable pawn) recursion ; else 

    private async changeCurrentPlayerCoinPosition(playerId: string, pawnIndex: number, rolledIndex: number = 0) {
        console.log("pawnIndex ", pawnIndex);
        console.log("rolledIndex ", rolledIndex);
        if (this.state !== GameState.RUNNING) {
            // In case of extra hit!.
            const resp = {
                changeTurn: true,
                phase: this.phase,
                players: this.players.map(p => p.playerInfo),
                state: this.state,
                turnIndex: this.turnIndex,
                rolledValues: this.rolledValues,
                // rollTime: this.rollTime,
                // moveTime: this.moveTime,
                turnTime: this.turnTime
            }
            return resp;
        };
        if (this.phase != GamePhase.MOVE_PAWN) {
            const error = new BaseHttpResponse(null, "Invalid Phase while moving - ph - " + this.phase, 400, this.ID);
            throw error;
        }
        let diceValue;
        const previousRolledValues = [...this.rolledValues];
        const newRolledValues = [];
        for (let i = 0; i < this.rolledValues.length; i++) {
            if (i == rolledIndex) {
                diceValue = this.rolledValues[i];
            }
            else {
                newRolledValues.push(this.rolledValues[i]);
            }
        }
        this.rolledValues = newRolledValues;
        // const diceValue = this.rolledValues[rolledIndex];
        console.log("diceValue", diceValue);
        const currentTurn = this.turnIndex;
        console.log("currentTurn ", currentTurn);
        const currentPlayer: Player = this.getCurrentPlayer();
        // @Puneet
        // currentPlayer.skipped(false);
        // END
        // invalid diceValue, change turn and shift
        if (!diceValue) {
            currentPlayer.sixCounter(false);

            this.changeTurn();
            this.log(`Change turn in movePawn due to invalid dice vaalue`, diceValue)
            const resp = {
                changeTurn: true,
                phase: this.phase,
                players: this.players.map(p => p.playerInfo),
                state: this.state,
                turnIndex: this.turnIndex,
                rolledValues: previousRolledValues,
                // rollTime: this.rollTime,
                // moveTime: this.moveTime,
                turnTime: this.turnTime,
            }
            this.log(`Change turn called in changeCoinPosition of player - ${currentPlayer.ID}`, resp)
            return resp;
        }
        else {
            const isValid = await this.validateCoinPosition(playerId, pawnIndex, diceValue);
            // if (diceValue == 6) {
            //     const tripple = currentPlayer.sixCounter(true);
            //     if (tripple == 3) {
            //         this.changeTurn();
            //         const resp = {
            //             changeTurn: true,
            //             phase: this.phase,
            //             players: this.players.map(p => p.playerInfo),
            //             state: this.state,
            //             turnIndex: this.turnIndex,
            //             rolledValues: this.rolledValues,
            //             rollTime: this.rollTime,
            //             moveTime: this.moveTime,
            //         }
            //         return resp;
            //     }
            // }
            // if (diceValue != 6) {
            //     currentPlayer.sixCounter(false);
            // }
            if (isValid) {
                console.log('Is valid move', isValid)
                if (isValid.coinEliminated) {
                    currentPlayer.sixCounter(false);
                    const resp: any = {
                        changeTurn: false,
                        phase: this.phase,
                        players: this.players.map(p => p.playerInfo),
                        state: this.state,
                        turnIndex: this.turnIndex,
                        rolledValues: previousRolledValues,
                        // rollTime: this.rollTime,
                        // moveTime: this.moveTime,
                        turnTime: this.turnTime,
                        move: {
                            isValid: isValid,
                            playerPos: currentTurn,
                            pawnIndex: pawnIndex,
                            diceValue: diceValue
                        },
                        kill: {
                            killer: {
                                pawnIndex: pawnIndex,
                                playerIndex: this.currentPlayer(currentTurn).POS
                            },
                            killed: isValid.coinEliminated
                        }
                    };
                    return resp;
                }
                else {
                    // this.changeTurn();
                    const resp: any = {
                        changeTurn: true,
                        phase: this.phase,
                        players: this.players.map(p => p.playerInfo),
                        state: this.state,
                        turnIndex: this.turnIndex,
                        rolledValues: previousRolledValues,
                        // rollTime: this.rollTime,
                        // moveTime: this.moveTime,
                        turnTime: this.turnTime,
                        move: {
                            isValid: isValid,
                            playerPos: currentTurn,
                            pawnIndex: pawnIndex,
                            diceValue: diceValue
                        },
                    };
                    console.log('Return resp', resp)
                    return resp;
                }
            }
            else {
                // this.changeTurn();
                this.rolledValues = previousRolledValues;
                const resp: any = {
                    changeTurn: true,
                    phase: this.phase,
                    players: this.players.map(p => p.playerInfo),
                    state: this.state,
                    turnIndex: this.turnIndex,
                    rolledValues: previousRolledValues,
                    // rollTime: this.rollTime,
                    // moveTime: this.moveTime,
                    turnTime: this.turnTime,
                    move: {
                        isValid: isValid,
                        playerPos: currentTurn,
                        pawnIndex: pawnIndex,
                        diceValue: diceValue
                    },
                };
                return resp;
            }
        }

    }
    public async onMovePawn(playerId: string, pawnIndex: number, rolledIndex: number) {
        const currentPlayer = this.getCurrentPlayer();
        if (currentPlayer.ID != playerId) {
            const error = new BaseHttpResponse(null, "Invalid User" + currentPlayer.ID, 400, this.ID);
            throw error;
        }
        const resp = await this.changeCurrentPlayerCoinPosition(playerId, pawnIndex, rolledIndex);
        console.log('Resp after pawn move', resp)


        // This insure last player get his chance complete(On 6,pawn kill, reach home).
        let nextPlayerId = this.getCurrentPlayer().ID
        if (resp?.changeTurn == true && playerId != nextPlayerId) {
            console.log('Change turn while move pawn')
            const gameOver = await this.checkGameTimeOverCondition(playerId);
            if (gameOver) {
                resp.state = this.state
                this.log('Gamze over while move pawn')
                // return httpResp;
            }
        }
        const httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
        this.log('move pawn resp=>', httpResp);
        resp.gameMode = this.gameMode;
        resp.gameTurnRemaining = this.gameTurnRemaining
        GameServer.Instance.socketServer.emitToSocketRoom(this.ID, "movePawn", httpResp);
        this.sendLogInMongo('onMovePawn', playerId);
        await this.gameSync()
        return httpResp;
    }

    private async updateRankOnReachingHome() {
        const userPrizes = await this.getContestPrize();
        this.log(`User prizes are(onReachHome)`, userPrizes)
        const players = this.players.map(p => p.playerInfo).sort((a, b) => b.score - a.score);
        players.forEach(player => {
            let isExitPlayer = player.isExitPlayer
            const rank = this.assignRank(player.userId, isExitPlayer);
            const getPlayer = this.currentPlayer(player.pos);
            let state = isExitPlayer ? player.state : PlayerState.WON
            this.log('Updating payer state on gamend on player reach home ', getPlayer.ID, state, rank, userPrizes[getPlayer.MID])
            getPlayer.updatePlayerState(state, rank, userPrizes[getPlayer.MID]);
        });
    }
    private async updatePlayerCoinPosition(pawnIndex: number, diceValue: number) {
        console.log("\n updatePlayerCoinPosition position ", pawnIndex, diceValue);
        const currentPlayer = this.getCurrentPlayer();
        const playerGameFinish = currentPlayer.setCoinPosition(pawnIndex, diceValue);
        const updatedPosition = currentPlayer.getPawnPosition(pawnIndex);
        console.log("\n updated position ", updatedPosition);
        console.log("\n updated finish game ", playerGameFinish);
        const coinEliminated = this.eliminateCoin(updatedPosition);
        const reachedHome = this.isCoinReachedHome(pawnIndex);
        console.log("\n updated coin eliminated ", coinEliminated);
        console.log("\n reached home  ", reachedHome);

        if (coinEliminated || reachedHome) {
            if (playerGameFinish) {
                this.noPlayerReachHome++;
                let rank = this.assignRank(currentPlayer.ID, false);
                this.log(`Updateing player state on player reach home -`, rank, currentPlayer.ID)
                currentPlayer.updatePlayerState(PlayerState.WON, rank);
                this.changeTurn();
                this.log(`Change turn and Player reaches home ${currentPlayer.ID} total player in home ${this.noPlayerReachHome}`)
                if (await this.canEndGameOnPlayerReachingHome()) {

                    this.log('Game finish due to player reach home first=>', currentPlayer.ID)
                    this.state = GameState.FINISHED;
                    await this.updateRankOnReachingHome();
                    const resp = {
                        phase: this.phase,
                        players: this.players.map(p => { const resp = p.playerInfo; console.log("player , ", resp); return resp; }),
                        state: this.state,
                        rolledValues: this.rolledValues,
                        turnIndex: this.turnIndex,
                        // rollTime: this.rollTime,
                        // moveTime: this.moveTime,
                        turnTime: this.turnTime,
                    }
                    const httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
                    // GameServer.Instance.socketServer.emitToSocketRoom(this.ID, "gameEnd", httpResp);
                    this.onGameEnd();
                }
            } else {
                this.turnPhase();
            }

            return { coinEliminated, reachedHome };
        }
        else if (diceValue == 6) {
            this.turnPhase();
        }
        else if (!this.rolledValues.length) {
            this.log(`Change turn on updateCoinPosition`)
            this.changeTurn();
        }
    }
    private checkCurrentPlayerWon() {
        const currentPlayer = this.getCurrentPlayer();
        return currentPlayer.hasWon;
    }
    public isCoinReachedHome(pawnIndex: number): any {
        if (this.checkCurrentPlayerWon()) {
            this.log('turnChange called current playr won', this.getCurrentPlayer().ID)
            // this.changeTurn();
            return true;
        }
        const currentPlayer = this.getCurrentPlayer();
        const position = currentPlayer.getPawnPosition(pawnIndex);
        if (position === 100) {
            const numberOfCoins = currentPlayer.getHomeCoinsCount();
            return true;
        }
        return false;
    }
    private async validateCoinPosition(playerId: string, pawnIndex: number, diceValue: number): Promise<any> {
        const currentPlayer = this.currentTurnPlayer(playerId);
        const pawnPos = currentPlayer.getPawnPosition(pawnIndex);
        console.log("pawn stack before ", currentPlayer.playerInfo.pawnStack);
        console.log("dice value ", diceValue);
        const isValid = isValidPawnPosition(currentPlayer.POS, diceValue, pawnPos, currentPlayer.killedBefore);
        console.log("isValid  ", isValid);
        if (isValid) {
            const resp = await this.updatePlayerCoinPosition(pawnIndex, diceValue);
            console.log('New coin position', resp)
            if (resp && resp.coinEliminated) {
                currentPlayer.updateHasKilled();
                return resp;
            }
            return true;
            // console.log("pawn stack after ", currentPlayer.playerInfo.pawnStack);
        }
        else if (!this.canMovePawn(currentPlayer.POS)) {
            console.error("\n cant move any pawn .........");
            // this.changeTurn();
            return false;
        }
        else {
            this.rolledValues.unshift(diceValue);
            return false;
        }
    }

    private canAttack(pawnPos: number): any {
        const coins = this.getAllCoinsAtPosition(pawnPos);
        return coins.length === 1;
    }

    public eliminateCoin(position: number, dryRun: boolean = false): any {
        if (isSafePosition(position)) {
            console.log("cant eliminate as its s safe cell");
            return false;
        }
        if (this.canAttack(position)) {
            console.log("\n can attack now ");
            // Update kill only when dryRun is false;
            return dryRun ? true : this.resetPlayerCoin(position);
            // return true;
        }
        return false;
    }
    private checkDoubling(position: number): Map<number, number> {
        let playerPositions: Map<number, number> = new Map();
        this.players.forEach(player => {
            player.getPawnStack().forEach((pawnPosition: number, pawnIndex: number) => {
                if (position == pawnPosition) {
                    if (playerPositions.has(player.POS)) {
                        playerPositions.set(player.POS, playerPositions.get(player.POS) + 1);
                    }
                    else {
                        playerPositions.set(player.POS, 1);
                    }
                }
            })
        });
        return playerPositions;
    }
    public getCurrentPlayer() {
        for (let index = 0; index < this.players.length; index++) {
            if (this.players[index].POS == this.turnIndex) {
                return this.players[index];
            }
        }
    }
    public getCurrentPlayerDID() {
        for (let index = 0; index < this.players.length; index++) {
            if (this.players[index].POS == this.turnIndex) {
                return this.players[index].DID;
            }
        }
    }
    public getAllCoinsAtPosition(position: number, includeCurrentPlayer = false): Array<any> {
        let arr: any = [];
        this.players.forEach((player, playerIndex) => {
            if (!player.isPlaying) {
                return
            }
            const p: any = {
                playerPos: player.POS,
                playerId: player.ID
            };
            console.log("check kill at position ", position);
            console.log("playerindex ");
            player.getPawnStack().forEach((pawnPosition, pawnIndex) => {
                if (pawnPosition == position && position != WINNING_POSITION) {
                    if (!includeCurrentPlayer && this.getCurrentPlayer().ID == player.ID) {
                        return
                    }
                    console.log("found pawnPosition ", pawnPosition);
                    console.log("found pawnIndex ", pawnIndex);
                    p.pawnPosition = pawnPosition;
                    p.pawnIndex = pawnIndex;
                    arr.push(p);
                }
            });
        });
        console.log("arr", arr);
        return arr;
    }


    private resetPlayerCoin(pawnPos: number): any {
        const currentPlayer = this.getCurrentPlayer();
        const coins = this.getAllCoinsAtPosition(pawnPos, true);

        // If a position has more than 2 pawns of any player then the position is safe
        if (coins.length > 2) {
            this.log('Pawn kill safe due to more than 2 pawns');
            return
        }
        const doublingTokens = this.checkDoubling(pawnPos);
        console.log("\n \n Doubling token response ", doublingTokens);
        const enemyPlayer = coins.find(
            (coin) => coin.playerId !== currentPlayer.ID
        );
        if (enemyPlayer) {
            const player = this.players.find((x) => x.ID === enemyPlayer.playerId);
            if (doublingTokens.has(player.POS) && doublingTokens.get(player.POS) >= 2) {
                console.log("\n This token is safe !!!!!", player.POS);
                return;
            }
            const killed: any = {
                pawnIndex: pawnPos,
                playerIndex: 1
            }
            killed.pawnIndex = player.eliminateCoin(pawnPos);
            killed.playerIndex = player.POS;
            return killed;

        }
    }

    private getTransactionData() {
        var data: TransactionTokenRequest = {
            cid: Number(this.CONTEST_ID),
            userList: [],
            gameserverid: this.ID,
            gameMode: this.gameMode
        }
        for (let i = 0; i < this.players.length; i++) {
            let player = this.players[i]
            data.userList.push({
                UserId: player.DID,
                UserLoginId: player.MID,
                ReferCode: player.REFER_CODE
            })
        }
        return data
    }

    private getPrivateRoomTransactionData(uniqueId: string, amount: number) {
        var data: PrivateTransactionTokenRequest = {
            userList: [],
            gameserverid: this.ID,
            uniqueid: Number(uniqueId),
            amt: amount,
            mba: 0,
            gameMode: this.gameMode
        }
        for (let i = 0; i < this.players.length; i++) {
            let player = this.players[i]
            data.userList.push({
                UserId: player.DID,
                UserLoginId: player.MID,
                ReferCode: player.REFER_CODE
            })
        }
        return data
    }

    private getWinningUserData() {
        var data: GameWinningData = {
            RoomId: this.roomId,
            ContestId: this.CONTEST_ID,
            participantScores: [],
            IsPrivate: this.isPrivate,
            ExitCount: 0,
            AutoExitCount: 0,
            NormalCount: 0
        };
        let exitCount = 0;
        let autoExitCount = 0;
        let normalCount = 0;
        for (let i = 0; i < this.players.length; i++) {
            let player = this.players[i]
            let score = player.SCORE
            if (player.isExitPlayer) {
                if (player.State == PlayerState.EXIT) {
                    score = -1
                    exitCount++;
                } else {
                    score = -2
                    autoExitCount++;
                }

            } else {
                normalCount++
            }
            data.participantScores.push({
                UserId: player.MID,
                Score: score
            })
        }
        data.ExitCount = exitCount;
        data.NormalCount = normalCount;
        data.AutoExitCount = autoExitCount;
        return data
    }
    private async gameSync() {
        const resp = await GameServer.Instance.GameServices.syncGameState(this._id, this.redisSyncGameData())
    }

    private async sendLogInMongo(evName: string, userId: string = null) {
        let ack = await GameServer.Instance.RabbitMQ.pushToLogQueue({
            evName: evName,
            roomId: this.roomId,
            evTimestamp: Date.now(),
            data: this.mongoLogGameData(userId)
        })
        this.log('Rabbit log ack', evName, ack);
    }

    public log(...args: any) {
        gameLog(this.ID, args);
        return
    }

    public async getContestPrize() {
        try {
            let userPrizes: any = {}
            const prizeReq: ContestWinnerRequest = {
                ContestId: Number(this.CONTEST_ID),
                RoomId: Number(this.roomId),
                ludoParticipantScore: []
            };
            for (let i = 0; i < this.players.length; i++) {
                let currentPlayer = this.players[i];
                // If player exit from game the send score -1 
                prizeReq.ludoParticipantScore.push({
                    UserId: Number(currentPlayer.MID),
                    Score: currentPlayer.isExitPlayer ? -1 : currentPlayer.SCORE
                })
                userPrizes[currentPlayer.MID] = 0;
            }
            let prizeResp;
            if (this.isPrivate) {
                prizeResp = await GameServer.Instance.TransactionMethods.getPrivateContestWinners(prizeReq, this.ID);
            } else {
                prizeResp = await GameServer.Instance.TransactionMethods.getContestWinners(prizeReq, this.ID);
            }
            for (let i = 0; i < prizeResp.length; i++) {
                userPrizes[prizeResp[i]?.UserId] = prizeResp[i]?.Amount
            }
            this.log('User prize data=>', prizeReq, prizeResp, userPrizes);
            return userPrizes

        } catch (err) {
            this.log('Error while getting user prize', err);
            throw err;
        }

    }

    private async canEndGameOnPlayerReachingHome(): Promise<boolean> {
        this.log(`Checking game can end on player reaching home?`, this.noOfContestWinner, this.noPlayerReachHome, this.canEndTheGame());
        if (this.capacity == 4) {
            if (this.noOfContestWinner != this.noPlayerReachHome && !this.canEndTheGame()) {
                this.log(`No game cannot end`);
                return false
            }
            this.log(`no of player reach home ${this.noPlayerReachHome} No of winner ${this.noOfContestWinner}`)
        }
        this.log(`Yes game can end`);
        return true;
    }

    private getNoOfWinner(data: ContestData) {
        return (parseInt(data.total_winners) / 100) * data.tt
    }

    public getPlayerDiceStack(playerId: string) {
        let player = this.getPlayerById(playerId);
        if (player) return player.DiceValueStack;
    }

    public destroyRoom() {
        this.log(`Destroy game`)
        if (this.gameType != GameType.NORMAL) {
            this.players.forEach((player) => {
                if (player.isXFac) {
                    player.xfac.destroyOnEnd(this.xFacLogId, this)
                }
            })
        }
        TableManager.deleteTableFromMap(this.ID);
        TableManager.removeTableFromRunningGroup(this.ID);

    }

    private emit(data: any, event: string) {
        GameServer.Instance.socketServer.emitToSocketRoom(this.ID, event, data);
        return true;
    }

    public async logGameEntry(playerId: string) {
        return await this.sendLogInMongo('gameEntry', playerId);
    }

    public get PLAYERS() {
        return this.players
    }
    public get GAME_TIME_REMAINING() {
        return this.gameTime - (Date.now() - this.gameStartTime);
    }

    public getWinnerId(): number {
        // this.log('Player at winnerId', this.players);
        let winnerId: number = null;
        this.players.forEach((player) => {
            if (player.State == PlayerState.WON) {
                winnerId = player.MID
            }
        })
        return winnerId
    }
    public isPlayerExist(playerId: string) {
        for (let index = 0; index < this.players.length; index++) {
            if (this.players[index].ID.toString() == playerId.toString()) {
                return true
            }
        }
        return false
    }
    public isExpired() {
        return ((Date.now() - this.gameStartTime) > 60000) && this.isWaiting()
    }
    public set GAME_CONFIG(val: GamePriority) {
        this.gameConfig = val
    }

    public async sendEmoji(emoji: number, sendBy: string) {
        if (this.gameType != GameType.NORMAL) {
            this.players.forEach((player) => {
                if (player.isXFac && sendBy != player.DID) {
                    player.xfac.sendEmoji(emoji)
                }
            })
        }
    }

    public isTimePassed(percent: number = 100) {
        let resp = false;
        this.log('Time passed function called', this.gameMode)
        if (this.gameMode == GameMode.TIME_BASED) {
            let timePassed = Date.now() - this.gameStartTime
            let timePassedPercent = Math.floor(timePassed / this.gameTime * 100)
            resp = timePassedPercent > percent
        } else if (this.gameMode == GameMode.TURN_BASED) {
            let turnPassed = this.totalTurn - this.gameTurnRemaining;
            let turnPassedPercent = Math.floor(turnPassed / this.totalTurn * 100)
            resp = turnPassedPercent > percent
        }
        this.log('Time passed result', resp);
        return resp;

    }
}