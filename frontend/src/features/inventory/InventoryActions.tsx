'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormModal } from '@/components/ui/FormModal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { formatAmount, formatDate } from '@/lib/format';
import { toast } from '@/store/toast';

export type InventoryAction = 'receive' | 'adjust' | 'write-off';

export interface InventoryTarget {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
}

interface ProductDetail {
  id: string;
  name: string;
  tracksExpiry: boolean;
  costPrice: string;
  batches?: Array<{ id: string; batchNumber: string; expiryDate: string; quantity: number }>;
}

/**
 * Stock movements from the back office.
 *
 * Each of these posts to an existing endpoint that writes the movement
 * ledger and an audit entry in the same transaction — stock never moves
 * without a reason and an actor (§13). The forms therefore make the
 * reason mandatory rather than treating it as a nicety.
 */
export function InventoryActions({
  action,
  target,
  onClose,
}: {
  action: InventoryAction | null;
  target: InventoryTarget | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [quantity, setQuantity] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [writeOffType, setWriteOffType] = useState('DAMAGED');
  const [batchId, setBatchId] = useState('');

  const open = action !== null && target !== null;

  // Only the product record knows whether it is batch-tracked, and the
  // inventory list does not carry that.
  const { data: product } = useQuery({
    queryKey: ['product', target?.productId],
    queryFn: () => api.get<ProductDetail>(`/products/${target!.productId}`),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setQuantity('');
    setNewQuantity(String(target?.quantity ?? ''));
    setReason('');
    setBatchNumber('');
    setExpiryDate('');
    setUnitCost('');
    setWriteOffType('DAMAGED');
    setBatchId('');
  }, [open, target?.productId, target?.quantity]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    void queryClient.invalidateQueries({ queryKey: ['products'] });
    void queryClient.invalidateQueries({ queryKey: ['expiry'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['product', target?.productId] });
  };

  const needsBatch = action === 'receive' && (product?.tracksExpiry ?? false);

  const submit = async () => {
    if (!target) return;

    if (action === 'receive') {
      await api.post('/inventory/stock-in', {
        productId: target.productId,
        quantity: Number(quantity),
        reason: reason.trim(),
        ...(needsBatch ? { batchNumber: batchNumber.trim(), expiryDate } : {}),
        ...(unitCost.trim() ? { unitCost: Number(unitCost).toFixed(2) } : {}),
      });
      toast.success(`${quantity} × ${target.name} received.`);
    }

    if (action === 'adjust') {
      await api.post('/inventory/adjust', {
        productId: target.productId,
        newQuantity: Number(newQuantity),
        reason: reason.trim(),
      });
      toast.success(`${target.name} adjusted to ${newQuantity}.`);
    }

    if (action === 'write-off') {
      await api.post('/inventory/write-off', {
        productId: target.productId,
        quantity: Number(quantity),
        type: writeOffType,
        reason: reason.trim(),
        ...(batchId ? { batchId } : {}),
      });
      toast.success(`${quantity} × ${target.name} written off.`);
    }

    refresh();
  };

  if (!target) return null;

  const COPY = {
    receive: {
      title: `Receive stock — ${target.name}`,
      description: 'Adds to stock and records why.',
      submit: 'Receive stock',
      tone: 'primary' as const,
    },
    adjust: {
      title: `Adjust stock — ${target.name}`,
      description: 'Corrects the level to what you actually counted.',
      submit: 'Save adjustment',
      tone: 'primary' as const,
    },
    'write-off': {
      title: `Write off — ${target.name}`,
      description: 'Removes damaged or expired stock from sale.',
      submit: 'Write off',
      tone: 'danger' as const,
    },
  };

  const copy = action ? COPY[action] : COPY.receive;

  const invalid =
    reason.trim().length < 3 ||
    (action === 'receive' && (!quantity || Number(quantity) < 1)) ||
    (action === 'write-off' && (!quantity || Number(quantity) < 1)) ||
    (action === 'adjust' && (newQuantity === '' || Number(newQuantity) < 0)) ||
    (needsBatch && (!batchNumber.trim() || !expiryDate));

  const delta =
    action === 'adjust' && newQuantity !== ''
      ? Number(newQuantity) - target.quantity
      : null;

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      submitLabel={copy.submit}
      submitTone={copy.tone}
      onSubmit={submit}
      disabled={invalid}
      size="sm"
    >
      {(fieldError) => (
        <>
          <div className="flex items-center justify-between rounded-lg bg-surface-sunken px-3 py-2.5 text-sm">
            <span className="text-ink-muted">
              {target.sku}
              {product?.tracksExpiry && (
                <Badge tone="info" className="ml-2">
                  batch tracked
                </Badge>
              )}
            </span>
            <span className="font-semibold tabular text-ink">{target.quantity} in stock</span>
          </div>

          {action === 'receive' && (
            <>
              <Input
                label="Quantity received"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                error={fieldError('quantity')}
                required
                data-autofocus
              />
              {needsBatch && (
                <>
                  <Input
                    label="Batch number"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    placeholder="From the supplier's carton"
                    hint="Receiving more of an existing batch tops it up"
                    error={fieldError('batchNumber')}
                    required
                  />
                  <Input
                    label="Expiry date"
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    hint="Stock already past its date cannot be received"
                    error={fieldError('expiryDate')}
                    required
                  />
                </>
              )}
              <Input
                label="Unit cost"
                type="number"
                step="0.01"
                min={0}
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder={product ? product.costPrice : 'Optional'}
                hint="Leave blank to use the product's cost price"
                error={fieldError('unitCost')}
              />
            </>
          )}

          {action === 'adjust' && (
            <>
              <Input
                label="Counted quantity"
                type="number"
                min={0}
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                hint="What is physically on the shelf right now"
                error={fieldError('newQuantity')}
                required
                data-autofocus
              />
              {delta !== null && delta !== 0 && (
                <div
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    delta > 0
                      ? 'border-success/30 bg-success/10 text-success'
                      : 'border-warning/30 bg-warning/10 text-warning'
                  }`}
                >
                  <span className="font-medium">
                    {delta > 0 ? '+' : ''}
                    {delta}
                  </span>{' '}
                  against the recorded level
                </div>
              )}
            </>
          )}

          {action === 'write-off' && (
            <>
              <Select
                label="Reason type"
                value={writeOffType}
                onChange={(e) => setWriteOffType(e.target.value)}
                options={[
                  { value: 'DAMAGED', label: 'Damaged' },
                  { value: 'EXPIRED', label: 'Expired' },
                ]}
              />
              <Input
                label="Quantity to write off"
                type="number"
                min={1}
                max={target.quantity}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                error={fieldError('quantity')}
                required
                data-autofocus
              />
              {(product?.batches?.length ?? 0) > 0 && (
                <Select
                  label="Batch"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  placeholder="Not batch specific"
                  options={(product?.batches ?? []).map((b) => ({
                    value: b.id,
                    label: `${b.batchNumber} · expires ${formatDate(b.expiryDate)} · ${b.quantity} left`,
                  }))}
                />
              )}
            </>
          )}

          <Input
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              action === 'receive'
                ? 'e.g. Delivery from supplier, invoice 4471'
                : action === 'adjust'
                  ? 'e.g. Monthly stock count'
                  : 'e.g. Bottles broken in transit'
            }
            hint="Recorded against this movement in the audit trail"
            error={fieldError('reason')}
            required
          />

          {action === 'receive' && unitCost.trim() && quantity && (
            <p className="text-xs text-ink-subtle">
              Total cost: {formatAmount((Number(unitCost) * Number(quantity)).toFixed(2))}
            </p>
          )}
        </>
      )}
    </FormModal>
  );
}
