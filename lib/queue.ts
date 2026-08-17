import { Queue } from 'bullmq'
import { redis } from './redis'

export const fileQueue = new Queue('file-processing', { connection: redis })
