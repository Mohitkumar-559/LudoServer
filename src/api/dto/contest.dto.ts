import { IUser } from "@data/user"

export interface ContestData {
    cid: string,
    cn: string,
    fw: string,
    wa: number,
    ba: boolean,
    tt: number,
    contest_msg: string,
    total_joined: number,
    cc: number,
    total_winners: string,
    mp: number,
    ja: number,
    catid: string,
    isPrivate: boolean,
    mate: number,
    mba: number,
    mea: boolean,
    jf: number,
    IsConfirm: boolean,
    IsDuplicateAllowed: boolean,
    Duration: number,
    GameStartInSeconds: number,
    IsStart: boolean,
    uniqueId?: string,
    IsXFac: boolean,
    XFacLevel:number,
    TurnTime: number,
    NoOfTurn: number,
    GameMode: number
}

export interface GameTicketData {
    gameId: string,
    capacity: number,
    serverIp: string,
    playerPos: number,
    contestId: string,
    timeSlot: number,       // For contest room
    gameServerTimeoutIn: number,
    gamePlayTime?: number
    joiningAmount?: number,  // For personal room
    isPrivate?: boolean,
    uniqueId?: string,       // For contest room
    metaData?: any
}

export interface JoinQueueData {
    ticket: GameTicketData,
    user: IUser
}

export interface PersonalContestData {
    WaitingTime: number,
    tt: number,
    total_winners: number,
    Duration: number,
    uniqueId: string,
    isPrivate: boolean,
    amt: number
}

export enum GamePriority{
    USER_FIRST = 1,
    XFAC_FIRST = 2,
    XFAC_OFF = 3
}