import mongoose from 'mongoose'

export interface IPlayers {
    
}

export interface ITable {
  _id: string
  players: string
  did: string
  token : string
  createdAt: Date
}

export const userModel = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  did: {
    type: String,
    required: true,
  },
  token: { type: String },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
})

export type User = typeof userModel
