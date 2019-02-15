export default interface CanvasWorkerMessage {
    cmd: 'INIT'|'UPDATE_NODES'|'UPDATE_SIZE'|'ADD_NODE'|'REMOVE_NODE';
    data?: any;
}