
interface ITable {
    id: string,
    players: Array<any>,
    capacity: number,
    isFull: boolean,
    state? : string
}

export class MatchService {
    private _queue: Array<ITable>
    constructor() {
        this._queue = [];
    }
    public onSearch(userId: string): ITable {
        const table: ITable | undefined = this._queue.length >0 ? this._queue[0] : undefined;
        console.log("table found ", table);
        const player = this.playerInfo(userId);
        if (!table) {
            return this.createTable(player);
        }
        else if (table.isFull) {
            return this.createTable(player);
        }
        else {
            table.players.push(player);
            if (table.players.length == table.capacity) {
                table.state = "running";
                table.isFull = true;
                table.players.forEach((p,i)=>{
                    p.color = i;
                    p.pos  = i;
                    p.pawnStack = [];
                    p.state = "playing"
                });
                this.removeFullTable(table);
                return table;
            }
            return table;
        }
    }
    private removeFullTable(table: ITable) {
        this._queue = this._queue.filter(tbl => {
            return tbl.id !== table.id;
        })
    }
    private playerInfo(playerId:string) : any {
        // return  Server.Instance.playerInfo(playerId);

    }
    private createTable(player: any): ITable {
        const newTable: ITable = {
            id: Date.now() + "id",
            players: [player],
            capacity: 4,
            isFull: false
        }
        this._queue.unshift(newTable);
        return newTable;
    }
}