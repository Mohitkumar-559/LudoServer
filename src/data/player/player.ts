import { Ludo } from '@data/game'
import { WINNING_POSITION } from '@data/game/game.model'
import { GameServices } from '@data/game/game.services'
import { pathValue, getPawnIndex, PLAYER_PATH, SAFE_CELLS, validateNewPosition, getRouteFirstValue, totalDistance } from '@data/game/path'
import { XFac } from '@data/xfac/xfac'
import { GameServer } from '@web/application'
import { PlayerOpts, PlayerState } from '.'
import { PlayerType } from './player.model'
export const EXIT_COIN_POSITION = 0
export class Player {
    private userId: string
    private name: string
    private color: number
    private pos: number
    private pawnStack: Array<number>
    private state: number
    private hasKilled: boolean
    private score: number
    private rank: number
    private skip: number
    private initPosition: number
    private sixers: number
    private did: string
    private mid: number;
    private prize: number;
    private referCode: string;
    private totalGameWinner: number;
    private playerType: PlayerType;
    public xfac: XFac;
    private dvStack: Array<number>;
    constructor(opts: PlayerOpts) {
        console.log("Player opts ", opts);
        this.userId = opts._id;
        this.mid = opts.mid
        this.did = opts.did
        this.referCode = opts.referCode
        this.name = opts.name;
        this.color = opts.pos != undefined ? (opts.pos + 1) : undefined;
        this.pos = opts.pos;
        this.initPosition = opts.pos != undefined ? PLAYER_PATH[opts.pos][0] : undefined;
        this.pawnStack = opts.pos != undefined ? [this.initPosition, this.initPosition, this.initPosition, this.initPosition] : [];
        // if(this.pos == 2) {
        //     this.pawnStack = [13,this.initPosition,this.initPosition,this.initPosition];
        //     // this.initPosition = PLAYER_PATH[opts.pos]
        // }
        this.state = 0;
        this.hasKilled = false;
        this.score = 0;
        this.rank = -1;
        this.skip = 0;
        this.sixers = 0;
        this.totalGameWinner = opts.totalGameWinners
        this.playerType = opts.playerType ? opts.playerType : PlayerType.HUMAN;
        this.xfac = opts.xfac;
        this.dvStack = [];
        console.log("Position ", this.pos);
        console.log("Paws stack for pos ", this.pos);
        console.log("Paws stack : ", this.pawnStack);
    }
    public initOnRestart(opts: any, ludo: Ludo) {
        this.userId = opts.userId;
        this.name = opts.name;
        this.color = (opts.pos + 1);
        this.pos = opts.pos;
        this.initPosition = opts.initPosition;
        this.pawnStack = opts.pawnStack;
        this.state = opts.state;
        this.hasKilled = opts.hasKilled;
        this.score = opts.score;
        this.rank = opts.rank;
        this.skip = opts.skip;
        this.sixers = opts.sixers;
        this.mid = opts.mid;
        this.did = opts.did;
        this.referCode = opts.referCode
        this.totalGameWinner = opts.totalGameWinner,
        this.playerType = opts.playerType || PlayerType.HUMAN
        if(this.playerType == PlayerType.XFAC){
            ludo.log('Creating xfac on playerInitOnRestart')
            this.xfac = new XFac(ludo);
            this.xfac.initOnRestart();
        }
    }
    public playerPropertiesLog(): any {
        const resp = {
            userId: this.userId,
            name: this.clearString(this.name),
            state: this.state,
            skip: this.skip,
            score: this.SCORE,
            
        }
        // return JSON.stringify(resp);
        return resp;
    }
    public playerProperties(): any {
        const resp = {
            userId: this.userId,
            name: this.clearString(this.name),
            color: this.color,
            pos: this.pos,
            pawnStack: this.pawnStack,
            state: this.state,
            hasKilled: this.hasKilled,
            skip: this.skip,
            score: this.SCORE,
            rank: this.rank,
            sixers: this.sixers,
            initPosition: this.initPosition,
            mid: this.mid,
            did: this.did,
            totalGameWinner: this.totalGameWinner,
            playerType: this.playerType,
            prize: this.prize

        }
        // return JSON.stringify(resp);
        return resp;
    }
    public sixCounter(bool: boolean): number {
        if (bool) {
            this.sixers++;
            return this.sixers;
        }
        else {
            this.sixers = 0;
            return this.sixers;
        }
    }
    public isTrippleSix(): boolean {
        if (this.sixers >= 3) {
            return true;
        }
        return false;
    }
    public skipped(yes: boolean): number {
        if (yes) {
            this.skip++;
        }
        else {
            // this.skip = 0;
        }
        return this.skip;
    }
    public get playerInfo(): any {
        if (this.rank >= 0) {
            if (![PlayerState.EXIT, PlayerState.AUTOEXIT].includes(this.state)) {
                if (this.rank <= this.totalGameWinner - 1) {
                    this.state = PlayerState.WON;
                }
                // Only change state to lost if user did not exit or auto exit
                else {
                    this.state = PlayerState.LOST;
                }
            }
        }
        const resp = {
            userId: this.userId,
            name: this.clearString(this.name),
            color: this.color,
            pos: this.pos,
            pawnStack: this.pawnStack,
            state: this.state,
            hasKilled: this.hasKilled,
            skip: this.skip,
            score: this.SCORE,
            rank: this.rank,
            mid: this.mid,
            did: this.did,
            referCode: this.referCode,
            prize: this.prize,
            isExitPlayer: this.isExitPlayer
        }
        return resp;
    }
    public updateHasKilled() {
        console.log("\n \n Hash Killed oppnent .......", this.ID);
        this.hasKilled = true;
    }
    public canUpdateState(): boolean {
        if (this.state === PlayerState.PLAYING) {
            return true;
        }
        return false;
    }
    public get State() {
        return this.state;
    }

    public get isExitPlayer() {
        return [PlayerState.EXIT, PlayerState.AUTOEXIT].includes(this.State);
    }
    public updatePlayerState(state: number, rank?: number, prize?: number): boolean {
        if (prize >= 0) {
            this.prize = prize;
        }
        if (this.rank === -1) {
            this.state = state;
            if (rank >= 0) {
                this.rank = rank;
            }
            return true;
        }
        return false;
    }
    public updateStateOnGameEnd() {
        console.log("\n updateStateOnGameEnd ..........");
        if (this.canUpdateState()) {
            console.log("\n updateStateOnGameEnd Done..........");
            this.state = PlayerState.LOST;
        }
    }
    public get ID(): string {
        return this.userId;
    }

    public get DID(): string {
        return this.did;
    }

    public get MID(): number {
        return this.mid;
    }
    public get REFER_CODE(): string {
        return this.referCode;
    }
    public get POS(): number {
        return this.pos;
    }
    public get RANK(): number {
        return this.rank;
    }
    public get SCORE(): number {
        let score = 0;
        this.pawnStack.forEach((pos, index) => {
            if (pos === WINNING_POSITION) {
                score += totalDistance() * 2;
            } else if (pos == EXIT_COIN_POSITION) {
                score += 0
            }
            else {
                score += getPawnIndex(this.POS, pos);
            }
        });
        this.score = score;
        return score;
    }
    private updatePos(index: number, pos: number) {
        this.pawnStack[index] = pos;
    }
    public setCoinPosition(pawnIndex: number, diceValue: number): boolean {
        const position = this.pawnStack[pawnIndex];
        if (position) {
            const positionIndex = getPawnIndex(this.pos, position, this.hasKilled);
            const newPositionIndex = diceValue + positionIndex;
            const newPosition = pathValue(this.pos, newPositionIndex, this.hasKilled);
            this.updatePos(pawnIndex, newPosition);
            return this.updateWinningStatus();
            // return true;
            // 
        }
        else if (diceValue === 6) {
            const startPos = getRouteFirstValue(this.pos);
            this.updatePos(pawnIndex, startPos);
            return false;
        }
    }
    isCoinReachedHome(): boolean {
        return true;
    }
    public calculateCoinPosition(pawnIndex: number, diceValue: number) {
        const position = this.pawnStack[pawnIndex];
        const positionIndex = getPawnIndex(this.pos, position, this.hasKilled);
        const newPositionIndex = diceValue + positionIndex;
        const newPosition = pathValue(this.pos, newPositionIndex, this.hasKilled);
        return newPosition
    }
    private updateWinningStatus(): boolean {
        let homeTokens = 0;
        this.pawnStack.forEach(coin => {
            if (coin === WINNING_POSITION) {
                homeTokens++;
            }
        });
        console.log("\n Home tokens ", homeTokens);
        // const won = this.pawnStack.every(
        //     (coin) => coin === WINNING_POSITION
        // );
        if (homeTokens >= 4) {
            this.state = PlayerState.WON;
            return true;
        }
        return false;
    }

    public getPawnPosition(pawnIndex: number): number {
        return this.pawnStack[pawnIndex];
    }
    public updateOnGameStart(state: number): boolean {
        this.state = state;
        return true;
    }
    public get isPlaying(): boolean {
        return (this.state === PlayerState.PLAYING) ? true : false
    }
    public get hasWon(): boolean {
        return (this.state === PlayerState.WON) ? true : false
    }
    getHomeCoinsCount(): number {
        return this.pawnStack.filter((pos) => pos === 100).length;
    }
    public canMoveAnyPawn(diceValue: number) {
        const arr: any[] = this.pawnStack.map(pawnPos => {
            return validateNewPosition(this.pos, pawnPos, diceValue, this.hasKilled);
        })
        console.log("can Move Arr ", arr);
        const some = arr.some(isTrue => isTrue);
        console.log("some movable  ", some);
        return some;
    }
    public canMovePawn(pawnIndex: number, diceValue: number) {

    }
    public updatePawnPosition(pawnIndex: number,): boolean {
        return true;
    }
    public getPawnStack(): Array<any> {
        return this.pawnStack;
    }
    public get killedBefore(): boolean {
        return this.hasKilled;
    }
    public eliminateCoin(pawnPos: number): number {
        for (let i = 0; i < this.pawnStack.length; i++) {
            if (this.pawnStack[i] == pawnPos) {
                this.pawnStack[i] = this.initPosition;
                return i;
            }
        }
    }

    public initPlayerPos(capacity: number, playerIndex: number): boolean {
        if (capacity == 2) {
            this.pos = playerIndex * 2;
        }
        else {
            this.pos = playerIndex
        }
        this.color = this.pos + 1
        this.initPosition = PLAYER_PATH[this.pos][0];
        this.pawnStack = [this.initPosition, this.initPosition, this.initPosition, this.initPosition];
        return true
    }

    public removePawnFromBoard() {
        this.pawnStack = [EXIT_COIN_POSITION, EXIT_COIN_POSITION, EXIT_COIN_POSITION, EXIT_COIN_POSITION]
    }

    public get isXFac() {
        return this.playerType == PlayerType.XFAC;
    }
    public get DiceValue() {
        return this.dvStack.pop()
    }

    public set DiceValueStack(values: Array<number>) {
        this.dvStack.push(...values);
    }

    public get DiceValueStack() {
        return this.dvStack;
    }

    private clearString(str: string){
        return str.replace(/\W/g, '');
    }

    // public removeGameFromRedis(gameId: string){
    //     GameServices.
    // }

}