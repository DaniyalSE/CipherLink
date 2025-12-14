import api from './api';

export interface BlockchainBlock {
  height: number;
  hash: string;
  previous_hash: string | null;
  message_hash: string;
  nonce: number;
  difficulty: number;
  created_at: string;
  payload: string | null;
}

export const fetchBlockchain = async (): Promise<BlockchainBlock[]> => {
  const response = await api.get<BlockchainBlock[]>('/blockchain/chain');
  return response.data;
};
