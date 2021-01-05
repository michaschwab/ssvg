export class SetPropertyQueueData {
    [attrName: string]: AttrValues | SharedArrayBuffer;
}
export type AttrValues = {[globalElementIndex: number]: string | number};
