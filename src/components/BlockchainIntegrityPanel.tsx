import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import api from '@/lib/api';

interface ValidateResponse {
  valid: boolean;
  issues: string[];
  details: string[];
  message: string;
}

async function validateBlockchain(): Promise<ValidateResponse> {
  const response = await api.get<ValidateResponse>('/blockchain/validate');
  return response.data;
}

const BlockchainIntegrityPanel: React.FC = () => {
  const [showResult, setShowResult] = useState(false);

  const { mutate, data, status, isError, error, reset } = useMutation({
    mutationFn: validateBlockchain,
    onSuccess: () => setShowResult(true),
    onError: () => setShowResult(true),
  });

  const handleValidate = () => {
    setShowResult(false);
    reset();
    mutate();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-lg mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold tracking-wide text-foreground">Blockchain Integrity Check</h3>
        <Button variant="default" size="sm" onClick={handleValidate} disabled={status === 'pending'}>
          {status === 'pending' ? 'Validating…' : 'Run Check'}
        </Button>
      </div>
      {showResult && (
        <Alert variant={isError || (data && !data.valid) ? 'destructive' : 'default'}>
          <AlertTitle>
            {isError || (data && !data.valid) ? 'Integrity Compromised' : 'Blockchain Valid'}
          </AlertTitle>
          <AlertDescription>
            {isError
              ? (error as Error)?.message || 'Unknown error'
              : data?.message || 'Blockchain is valid and untampered.'}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default BlockchainIntegrityPanel;
