import { EventEmitter } from "events";
export const io = new EventEmitter();
io.to = room => ({ emit: (event, data) => io.emit(`${room}:${event}`, data) });
