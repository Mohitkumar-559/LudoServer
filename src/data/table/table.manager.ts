import { GameState, Ludo } from '@data/game'
import { gameLog } from '@lib/logger';
import { GameServer } from '@web/application';
import { TableFactory } from './table.factory'
export abstract class TableManager {
    private static _tableMap: Map<string, Ludo> = new Map();
    private static _waitingTables: Set<string> = new Set();
    private static _4_waitingTables: Set<string> = new Set();

    private static createTable(opts: any): Ludo {
        const newTable: Ludo = TableFactory.getTable(opts);
        if (!newTable) return null;
        newTable.initTable(opts.playerCount);
        this._tableMap.set(newTable.ID, newTable);
        this.addWaitingTable(newTable.ID, newTable.Capacity);
        this._waitingTables.add(newTable.ID);
        gameLog('counters', 'Table map count', newTable.ID, this._tableMap.size, this._waitingTables.size);
        return newTable;
    }
    public static addWaitingTable(tableId: string, capacity: number) {
        if (capacity == 2) {
            this._waitingTables.add(tableId);
        }
        else {
            this._4_waitingTables.add(tableId);
        }
    }
    public static search(searchOpts: any): Ludo {
        const table: Ludo = this.searchTable(searchOpts);
        if (table) return table;
        gameLog('common', 'Creating new table for user ', searchOpts.userId)
        return this.createTable(searchOpts);
    }
    private static searchTable(searchOpts: any): Ludo {
        gameLog('common', 'Search table for ', searchOpts.userId)
        if (searchOpts.playerCount == 2) {
            for (const tableId of this._waitingTables) {
                gameLog(tableId, 'Check table ', tableId, 'in table map')
                console.log('++++++++++++======>', tableId, this._tableMap.get(tableId).CONTEST_ID, this._tableMap.get(tableId)?.canJoin(searchOpts.userId))
                if (this._tableMap.has(tableId) && this._tableMap.get(tableId).CONTEST_ID == searchOpts.contestId && this._tableMap.get(tableId)?.canJoin(searchOpts.userId)) {

                    return this._tableMap.get(tableId);
                }
            }
        }
        else {
            for (const tableId of this._4_waitingTables) {
                gameLog('common', 'Check table ', tableId, 'in table map')
                console.log('TABLE MAP', this._tableMap)
                if (this._tableMap.has(tableId) && this._tableMap.get(tableId).CONTEST_ID == searchOpts.contestId && this._tableMap.get(tableId)?.canJoin(searchOpts.userId)) {
                    gameLog('common', 'User can use this table', this._tableMap.get(tableId))
                    return this._tableMap.get(tableId);
                }
            }
        }
    }
    public static deleteTableFromMap(tableId: string): boolean {
        if (this._tableMap.has(tableId)) {
            if (this._tableMap.get(tableId).isRunning()) return false;
            this._tableMap.delete(tableId)
            // console.log("deleted from map ", tableId);
            gameLog('counters', 'Delete table map', this._tableMap.size,
                this._waitingTables.size, tableId, this._tableMap.has(tableId));
            return true;
        }
    }
    public static removeTableFromRunningGroup(tableId: string) {
        this._waitingTables.delete(tableId);
    }

    public static async fetchTableStateRedis(gameId: string): Promise<Ludo> {    
        const table = await GameServer.Instance.GameServices.getFullGameState(gameId);
        gameLog(gameId, 'Fetching table from redis', table)
        // && table.state == GameState.RUNNING
        if (table ) {
            const game: Ludo = this.createTable(table);
            if(table.state == GameState.RUNNING){
                game.initTableOnRestart(table);
            }
            return game;
        }
    }

    public static async getGameStateRedis(gameId: string): Promise<GameState> {
        const table = await GameServer.Instance.GameServices.getFullGameState(gameId);
        if(table){
            return table.state
        }
        return null
    }

    public static getTableFromMemory(gameId: string): Ludo {
        return this._tableMap.get(gameId);
    }
    public static fetchTable(searchOpts: any) {
        let ludo: Ludo = this.getTableFromMemory(searchOpts._id);
        if (!ludo) {
            console.log('UNABLE TO FETCH LUDO FROM MEMORY, CREATING NEW LUDO');
            ludo = this.createTable(searchOpts);
        }
        return ludo
    }
}