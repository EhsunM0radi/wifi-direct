export type FileMetadata = {
  name: string;
  size: number;
  type: string;
};

export type TransferProgress = {
  [fileName: string]: {
    transferred: number;
    total: number;
    completed: boolean;
    url?: string;
  };
};
