import {Ludo} from '@data/game'
export enum GAME_TYPES {
    QUICK = 1,
    SPIRAL = 2
}
export class TableFactory {
    public static getTable(tableOptions : any) {
        switch (tableOptions.gameType) {
            case GAME_TYPES.QUICK:
                return new Ludo(tableOptions);
            default:
                return new Ludo(tableOptions);
        }
    }
}