import { MatchService } from "./match.service";
import * as socketIO from 'socket.io'

export class MatchController {
    constructor(private readonly _service: MatchService) {
    }
    public async onMatchInit(payloadDto: any, userId: string, socket: socketIO.Socket, callback: any) {
        const table = this._service.onSearch(userId);
        socket.join(table.id);
        callback(table);
    }
}