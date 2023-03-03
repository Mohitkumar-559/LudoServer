import { ContestData } from "@api/dto/contest.dto";
import { Ludo } from "@data/game";
import { IUser, User } from "@data/user";
import { AuthenticationService } from "@logic/services";
import { GameServer } from "@web/application";
import { Player, PlayerType } from "..";
import { XFacMove, GameType, MoveType } from "@data/game/game.model";
import { getPawnDistanceFromHome, isNearHome, isSafePosition, isValidPawnPosition } from "@data/game/path";
import { XFacService } from "./xfac.service";
import { EmojiReply, XFacGameLog } from "./xfac.dto";

// This xfac work in case of 2 player game only
export class XFac {
    private user: User
    private ludo: Ludo
    private performOptimalMove: boolean = false;
    private opponentId: number;
    private token: string;
    private level: number;
    private isResultLogged: false;
    private xFacLogId: number;
    private xfacState = {
        BIG_WINNING: 3,
        CLOSE_WINNING: 2,
        EQUAL: 1,
        NO_STATE: 0,
        CLOSE_LOSSING: -1,
        BIG_LOSSING: -2,
        NEUTRAL: 4
    }
    constructor(ludo: Ludo) {
        this.ludo = ludo;
        this.ludo.log('Xfac created', this.user)
    }

    public async initOnRestart() {
        if(!this.ludo?.getXFacData().xFacId){
            this.ludo?.log('Invalid xfac to data to restart check redis data');
            return
        }
        let userData = await this.getUserDataFromId(this.ludo.getXFacData().xFacId);
        this.user = new User(null, userData, this)
        this.user.ludo = this.ludo
        this.opponentId = this.getOpponentId(userData._id)
        this.level = this.ludo?.getXFacData().xFacLevel
    }

    private getOpponentId(selfId: string){
        let opponentId;
        this.ludo.PLAYERS.forEach((p)=>{
            if(p.DID.toLocaleLowerCase()!=selfId.toLocaleLowerCase()){
                opponentId = p.MID
            }
        })
        return opponentId
    }

    private canPerformOptimalMove() {
        let xfacState = this.getState();
        this.ludo?.log('get state in optimal move', xfacState);
        if (!this.performOptimalMove) {
            if (xfacState == this.xfacState.NO_STATE) {
                let randomNo = Math.floor(Math.random() * 2)
                this.performOptimalMove = randomNo == 1;
            } else if (xfacState > this.xfacState.EQUAL) {
                this.performOptimalMove = false
            } else {
                this.performOptimalMove = true
            }
            this.ludo.log('XFac check kill: ', this.performOptimalMove, xfacState)
        }
        this.ludo.log('XFac perform kill: ', this.performOptimalMove)
        return this.performOptimalMove;
    }

    public async makeMove() {
        try {
            if (!this.ludo.isRunning) {
                return false;
            }
            this.ludo?.log('Xfac roll dice timeout')
            await this.timeout();
            this.ludo.log('XFac turn come')

            const rollDiceResp: any = await this.user.onRollDice({}, () => { })
            console.log('Roll dice resp', rollDiceResp);
            const dv: number = rollDiceResp?.data?.rolledValues[0]


            let optimalMove: XFacMove = this.decideMove(dv)



            // let pawnToMove = pawnMoves.length > 0 ? pawnMoves[0].pawnIndex : 0;
            this.ludo?.log('Xfac move pawn timeout')
            await this.timeout();
            let moveResp = await this.user.onMovePawn({ pawnIndex: optimalMove?.pawnIndex || 0 }, () => { })
            if (this.ludo.getCurrentPlayer().ID == this.user.playerOpts._id) {
                this.ludo.log('XFac get next turn also')
                this.makeMove();
            }
            return
        } catch (err) {
            this.ludo?.log('Error in XFac makeMove', err);
        }
    }

    public async joinMatch(opponentId: number, xFacId: string = null, level: number = null) {
        try {
            const contestData = await GameServer.Instance.ContestMethods.getContestById(this.ludo.CONTEST_ID);
            this.opponentId = opponentId;
            let userData: IUser;
            if (xFacId) {
                userData = await this.getUserDataFromId(xFacId);
                this.level = level
            } else {
                userData = await this.getUserDataForXFac(contestData)
            }
            // userData.name = 'x_'.repeat(this.level) + userData.name

            console.log('User data', userData)
            this.user = new User(null, userData, this)
            this.ludo.setXFacData(userData._id, this.level)
            this.xFacLogId = this.xFacLogId || this.ludo.xFacLogId
            let joinResp = await this.ludo.join(this.user.playerOpts, 0, contestData, this.level
            );
            this.ludo.log('XFac success in join match', joinResp);
            this.user.ludo = this.ludo
        } catch (err) {
            this.ludo.log('Error in XFac joining=>', err);
            throw err
        }

    }

    private async getUserToken(contestData: ContestData) {
        // Call method to get user id
        // Call method to get user token
        try {
            let xFacUserData = await XFacService.Instance.getUserToken(contestData.ja, contestData.mba, this.ludo.ID, this.opponentId);
            this.level = xFacUserData.xFacLevel;
            this.xFacLogId = xFacUserData.xFacLogId;
            this.ludo.xFacLogId = this.xFacLogId
            return xFacUserData.token
        } catch (err) {
            this.ludo.log('Error in getUserToken', err);
            return null
        }

    }

    private async getUserDataForXFac(contestData: ContestData) {
        let userToken = await this.getUserToken(contestData);
        if (!userToken) throw new Error('Unable to create token for xfac')
        let user: IUser = AuthenticationService.validateToken(userToken);
        if (!user) throw new Error('Unable to create user for xfac')
        return user;
    }

    private async getUserDataFromId(userId: string) {
        let userToken = await XFacService.Instance.getToken(userId);
        let user: IUser = AuthenticationService.validateToken(userToken);

        if (!user) throw new Error('Unable to create user for xfac')
        return user;
    }

    private timeout() {
        let MAX_TURN_TIME = 5;
        let MIN_TURN_TIME = 1;
        let xfacState = this.getState();
        this.ludo?.log('xfac state on timeout', xfacState);
        if (xfacState == this.xfacState.BIG_WINNING) {
            MAX_TURN_TIME = 6
            MIN_TURN_TIME = 3
        } else if (xfacState == this.xfacState.BIG_LOSSING) {
            MAX_TURN_TIME = 4
            MIN_TURN_TIME = 0
        }
        let waitTime = Math.ceil(Math.random() * (MAX_TURN_TIME - MIN_TURN_TIME) + MIN_TURN_TIME) * 1000;
        this.ludo?.log(`Max is ${MAX_TURN_TIME}, Min is ${MIN_TURN_TIME}, waitTime is ${waitTime}`)
        return new Promise(resolve => setTimeout(resolve, waitTime));
    }

    private waitFor(sec: number){
        return new Promise(resolve => setTimeout(resolve, sec*1000));
    }

    private decideMove(dv: number) {
        try {
            let currentPlayer = this.ludo.getCurrentPlayer();
            let xFacPawnStack = currentPlayer.getPawnStack();
            let xfacMoves: Array<XFacMove> = [];
            let similarMoves: Array<XFacMove> = [];
            if (this.ludo.canMovePawn(currentPlayer.POS)) {
                xFacPawnStack.forEach((pawnPos, pawnIndex, pawnStack) => {

                    if (isValidPawnPosition(currentPlayer.POS, dv, pawnPos, false)) {
                        let newPawnPos = currentPlayer.calculateCoinPosition(pawnIndex, dv);
                        if (this.ludo.eliminateCoin(newPawnPos, true)) {
                            xfacMoves.push({
                                pawnIndex: pawnIndex,
                                moveType: MoveType.KILL,
                                newPos: newPawnPos
                            });
                            return
                        } else if (newPawnPos == 100) {
                            xfacMoves.push({
                                pawnIndex: pawnIndex,
                                moveType: MoveType.HOME,
                                newPos: newPawnPos
                            });
                            return
                        } else if (isSafePosition(newPawnPos)) {
                            xfacMoves.push({
                                pawnIndex: pawnIndex,
                                moveType: MoveType.SAFE_POSITION,
                                newPos: newPawnPos
                            });
                            return
                        } else if (XFac.isSafeMove(this.ludo, newPawnPos) || dv == 6) {
                            xfacMoves.push({
                                pawnIndex: pawnIndex,
                                moveType: MoveType.NORMAL_SAFE,
                                newPos: newPawnPos
                            });
                            return
                        } else {
                            xfacMoves.push({
                                pawnIndex: pawnIndex,
                                moveType: MoveType.NORMAL_RISK,
                                newPos: newPawnPos
                            });
                        }
                    }
                })
            }
            // Sort moves according to weightage
            xfacMoves.sort((a, b) => a.moveType - b.moveType);
            this.ludo?.log('Possible moves are =>', xfacMoves)
            let optimalMove = xfacMoves[0];
            xfacMoves.forEach((move) => {
                if (move.moveType == optimalMove.moveType) {
                    similarMoves.push(move)
                }
            })
            if (similarMoves.length == 0) {
                return null
            }

            let randomIndex = Math.floor(Math.random() * similarMoves.length)
            randomIndex = randomIndex > 1 ? 1 : randomIndex

            let moveToExecute = similarMoves[randomIndex];
            // If moveToexecute is of type of normal then give priority to pawn that is near to reach home
            if (moveToExecute.moveType == MoveType.NORMAL_SAFE) {
                // Sort descending according to path
                similarMoves.sort((a, b) => getPawnDistanceFromHome(currentPlayer.POS, b.newPos) - getPawnDistanceFromHome(currentPlayer.POS, a.newPos));
                moveToExecute = similarMoves[0]
                // for (let i = 0; i < similarMoves.length; i++) {
                //     let move = similarMoves[i]
                // if (isNearHome(currentPlayer.POS, xFacPawnStack[move.pawnIndex])) {
                //         moveToExecute = move
                //         break
                //     }
                // }

                // If moveToexecute is of type of risky normal then give priority to pawn that is near to starting point
            } else if (moveToExecute.moveType == MoveType.NORMAL_RISK) {
                similarMoves.sort((a, b) => getPawnDistanceFromHome(currentPlayer.POS, a.newPos) - getPawnDistanceFromHome(currentPlayer.POS, b.newPos));
                moveToExecute = similarMoves[0]
            }
            this.ludo.log('XFac posible moves', xfacMoves, similarMoves, moveToExecute);

            return moveToExecute
        } catch (err) {
            this.ludo.log('Error in XFac decideMove', err);
        }

    }

    public static isSafeMove(ludo: Ludo, newPos: number) {
        console.log('check safe move call', newPos)
        for (let i = 1; i <= 5; i++) {
            let backPos = newPos - i;
            let resp = ludo.getAllCoinsAtPosition(backPos, false);
            console.log(newPos, i, backPos, resp)
            if (resp.length >= 1) {
                return false
            }
        }
        return true
    }

    public static getNonKillValue(opponent: Player, ludo: Ludo) {
        try {
            let dv: number;
            let isKill = false;
            let randomNo = Math.floor(Math.random() * 3)
            // Only 33% chance to allow player to kill pawn 
            let allowToKill = randomNo == 0 ? true : false

            // If dice stack is emply first fill it;
            if (opponent.DiceValueStack.length == 0) {
                ludo.generateDiceValue();
            }

            // Only get non kill value when allowToKill = false
            if (!allowToKill) {
                let i = 0;
                ludo.log('Opponent stack', opponent.DiceValueStack)
                for (; i < opponent.DiceValueStack.length; i++) {
                    dv = opponent.DiceValueStack[i]
                    isKill = false;
                    opponent.getPawnStack().forEach((pawnPos, pawnIndex, stack) => {
                        if (isValidPawnPosition(opponent.POS, dv, pawnPos, false)) {
                            let newPawnPos = opponent.calculateCoinPosition(pawnIndex, dv);
                            if (ludo.eliminateCoin(newPawnPos, true)) {
                                ludo.log('Found value that kill XFac', dv, newPawnPos, pawnIndex, opponent.DiceValueStack)
                                isKill = true

                            }
                        }
                    });
                    if (!isKill) {
                        break
                    }
                }
                opponent.DiceValueStack.splice(i, 1);
                ludo.log('Opponent dv is', dv);
            }

            return dv
        } catch (err) {
            ludo.log('Error in opponentMove', err);
        }

    }

    public static getOptimalValue(player: Player, ludo: Ludo, moveType: MoveType = MoveType.KILL): number {
        let dv: number;
        for (let pawnIndex = 0; pawnIndex < player.getPawnStack().length; pawnIndex++) {
            for (let i = 1; i <= 6; i++) {
                let newPawnPos = player.calculateCoinPosition(pawnIndex, i);
                // ludo.log('Postin=>', i, pawnIndex, newPawnPos)
                if (moveType == MoveType.KILL) {
                    if (ludo.eliminateCoin(newPawnPos, true)) {
                        // if (i > 6 && i < 13) {
                        //     player.DiceValueStack.unshift(i - 6)
                        //     return 6;
                        // } else if (i > 12 && i <= 17){
                        //     player.DiceValueStack.unshift(6, i-12)
                        //     return 6
                        // }
                        ludo.log('Kill value=====>', i);
                        return i;
                    }
                } else if (moveType == MoveType.HOME && newPawnPos == 100) {
                    ludo.log('home value=====>', i);
                    return i;
                } else if (moveType == MoveType.SAFE_POSITION && isSafePosition(newPawnPos)) {
                    ludo.log('safe value=====>', i, newPawnPos);
                    return i;
                }
            }

        };
        return null
    }

    public getDv(player: Player): number {
        this.ludo?.log('OPTIMAL MOVE CALL');
        if (this.canPerformOptimalMove()) {
            let killDiceValue = XFac.getOptimalValue(player, this.ludo, MoveType.KILL);
            if (!killDiceValue) {
                killDiceValue = XFac.getOptimalValue(player, this.ludo, MoveType.HOME);
                if (!killDiceValue) {
                    killDiceValue = XFac.getOptimalValue(player, this.ludo, MoveType.SAFE_POSITION);
                }
            }
            this.ludo.log('Xfac kill value: ', killDiceValue);
            if (killDiceValue) this.performOptimalMove = false;
            return killDiceValue;
        }
        return null
    }

    // Method to check if xfac is losing or winning or normal.
    public getState() {
        let self: Player, opponent: Player;
        let SAFE_SCORE_DIFF = 20;

        this.ludo.log('game time on getState', this.ludo.isTimePassed(50))
        if (this.level == GameType.XFAC_HARD && !this.ludo.isTimePassed(50)) {
            return this.xfacState.NO_STATE
        } else if (this.level == GameType.XFAC_EASY && !this.ludo.isTimePassed(70)) {
            return this.xfacState.NEUTRAL;
        }


        for (let i = 0; i < this.ludo.PLAYERS.length; i++) {
            if (this.ludo.PLAYERS[i].ID == this.user.playerOpts._id) {
                self = this.ludo.PLAYERS[i]
            } else {
                opponent = this.ludo.PLAYERS[i]
            }
        }
        let scoreDiff = self.SCORE - opponent.SCORE
        if (scoreDiff > SAFE_SCORE_DIFF) {
            return this.xfacState.BIG_WINNING;
        } else if (scoreDiff > 0 && scoreDiff <= 20) {
            return this.xfacState.CLOSE_WINNING;
        } else if (scoreDiff == 0) {
            return this.xfacState.EQUAL
        } else if (scoreDiff > -SAFE_SCORE_DIFF) {
            return this.xfacState.CLOSE_LOSSING
        } else {
            return this.xfacState.BIG_LOSSING
        }
    }

    public async destroyOnEnd(xFacLogId: number, ludo: Ludo) {
        try{
            if (!this.isResultLogged) {
                let winnerId = ludo.getWinnerId();
                let result = winnerId == this.user.playerOpts.mid ? false : true
                let logData: XFacGameLog = {
                    UserId: Number(this.opponentId),
                    XFacId: Number(this.user.playerOpts.mid),
                    XFacLevel: this.level,
                    RoomId: ludo.roomId,
                    Result: result,
                    ContestId: ludo?.CONTEST_ID ? parseInt(ludo.CONTEST_ID) : null,
                    xFacLogId: xFacLogId || this.xFacLogId
                }
                ludo.log('Send xfac logs', logData, winnerId, this.user.playerOpts.mid)
                await XFacService.Instance.saveXFacGameLog(logData)
            }
            this.user.ludo = null;
            this.ludo = null;
            this.user = null;
            return;
        }catch(err){
            ludo?.log('Error in destroyOnEnd=>', err)
        }
    }

    public async sendEmoji(emoji: number) {
        let randomNo = Math.floor(Math.random() * 2)
        let sendEmoji = randomNo == 0;
        let emojiReplys = EmojiReply[emoji as keyof typeof EmojiReply]
        if(!this.ludo){
            return 
        }
        this.ludo.log('xfac tries to send emoji', sendEmoji, emojiReplys);
        if(sendEmoji && emojiReplys){
            let randomReplyIndex = Math.floor(Math.random() * emojiReplys.length)
            let resp = {
                messageId: emojiReplys[randomReplyIndex],
                userId: this.user.playerOpts.did
            }
            let randomTime = Math.ceil(Math.random() * (4 - 1) + 1);
            await this.waitFor(randomTime)
            this.user.onSendEmoji(resp, () => { })
        }
    }

}