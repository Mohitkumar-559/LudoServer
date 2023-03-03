import { DBContext } from '@data/db.context'
import { IUser } from './user.model'

export class UserRepo {
  constructor(private readonly _dbContext: DBContext) {

  }

  // async all() {
  //   return this._dbContext.user.find({})
  // }

  // async findOne(id: IUser['_id']) {
  //   return this._dbContext.user
  //     .findById(id)
  //     .then((entity) => entity)
  //     .catch(() => {
  //       return null
  //     })
  // }
  // async findOneByDid(did : IUser["did"]) {
  //   return this._dbContext.user
  //   .findOne({did:did})
  //   .then((entity) => entity)
  //   .catch(() => {
  //     return null
  //   })
  // }

  // async findOneByToken(token:IUser["token"]) {
  //   return this._dbContext.user
  //   .findOne({token:token})
  //   .then((entity) => entity)
  //   .catch(() => {
  //     return null
  //   }) 
  // }
  // async create(entity: Partial<IUser>) {
  //   return this._dbContext.user.create(entity)
  // }

  // async updateOne(payload: Partial<IUser>) {
  //   const foundSubscriber = await this._dbContext.user.findById(
  //     payload._id
  //   )

  //   if (!foundSubscriber) {
  //     throw new Error('user does not exist')
  //   }

  //   if (payload.name) {
  //     foundSubscriber.name = payload.name
  //   }
    
  //   foundSubscriber.save()
  // }

  // async deleteOne(id: string) {
  //   return this._dbContext.user.deleteOne({ _id: id })
  // }
}
