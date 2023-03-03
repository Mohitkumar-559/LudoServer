import { gameLog } from "@lib/logger";
import { GameServer } from "@web/application";

export function sendGameEndEvent(resp: any, _id: string) {
    gameLog(_id, 'Sending game End event', resp);
    GameServer.Instance.socketServer.emitToSocketRoom(_id, "gameEnd", resp);
}