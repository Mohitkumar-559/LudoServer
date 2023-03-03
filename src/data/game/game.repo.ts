import { DBContext } from '@data/db.context'

export class GameRepo {
    constructor(private readonly _dbContext: DBContext) {
    }
    async create(data: any) {
        return this._dbContext.game.create(data);
    }
    async findOne(id: any, projection: any, options: any) {
        return this._dbContext.game.findById(id, projection, { ...options, lean: true });
    }
    async findByIdAndUpdate(id: any, data: any, options: any) {
        return this._dbContext.game.findByIdAndUpdate(id, data, { ...options, lean: true });
    }
    async findByIdAndDelete(id: any) {
        return this._dbContext.game.findByIdAndDelete(id);
    }
}
