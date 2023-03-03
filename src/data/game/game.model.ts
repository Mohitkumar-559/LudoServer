import { IPlayers } from '@data/table'
import mongoose from 'mongoose'
export enum GameState {
    WAITING = 1,
    RUNNING = 2,
    FINISHED= 3,
    DESTROYED= 4
}
export const WINNING_POSITION = 100;

export type GameOpts = {
    _id: string
    capacity : number
    state : number
}

export enum GameType {
    NORMAL = 1,
    XFAC_EASY = 2,
    XFAC_MEDIUM = 3,
    XFAC_HARD = 4
}
export interface IGame {
    _id: string
    players: Array<IPlayers>
    state: GameState
    capacity : number
    isFull : boolean
    createdAt : number
}

export interface GameWinningData {
    RoomId: number,
    ContestId: string,
    participantScores: Array<{UserId: number, Score: number}>,
    IsPrivate: boolean,
    ExitCount: number,
    AutoExitCount: number ,
    NormalCount: number

}

export enum MoveType{
    KILL = 1,
    HOME = 2,
    SAFE_POSITION = 3,
    NORMAL_SAFE = 4,
    NORMAL_RISK = 5

}

export interface XFacMove{
    pawnIndex: number,
    moveType: MoveType,
    newPos: number
}

export enum GamePhase {
    ROLL_DICE = 1,
    MOVE_PAWN = 2
}

export enum TURN_SKIP_REASON {
    TURN_TIMEOUT = 1,
    TRIPPLE_SIX = 2,

}

export enum PAWN_COLOR {
    BLUE = 1,
    RED = 2,
    GREEN =3 ,
    YELLOW = 4
}
export const gameModel = new mongoose.Schema({
    players: {
        type: Array,
    },
    state: {
        type: Number,
        required: true,
        default : GameState.WAITING
    },
    capacity : Number,
    isFull : Boolean,
},{timestamps: true})

export const finalResult = new mongoose.Schema({
    RoomId: String,
    ContestId: String,
    IsPrivate: Boolean,
    ExitCount: Number,
    AutoExitCount: Number,
    NormalCount: Number,
    participantScores: Array
},{timestamps: false, collection:'FinalResultLog'})

export enum GameMode{
    TIME_BASED = 1,
    TURN_BASED = 2
}

export enum GameIds {
    LUDO = 1,
    RUMMY = 4
}

export type TGame = typeof gameModel
