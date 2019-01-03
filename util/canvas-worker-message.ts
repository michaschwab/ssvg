export default interface CanvasWorkerMessage {
    cmd: 'INIT'|'UPDATE_NODES'|'UPDATE_SIZE'|'ADD_NODE';
    data?: any;
}