import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput } from 'react-native';
import { Button } from '../common/Button';
import { apiClient } from '../../api/client';
import { appendMedia } from '../../../web/storage';
import { EvidenceItem } from '../../types';

type Values = Record<'quality' | 'view' | 'findings' | 'vin' | 'odometer' | 'notes', string>;
export interface EvidenceAiResult { id: string; model: string; original: Values; analyzedAt: string; reviewed?: Values }
const labels: Record<keyof Values, string> = { quality: 'Photo quality', view: 'Evidence view', findings: 'Possible visible defects', vin: 'VIN', odometer: 'Odometer', notes: 'Notes' };

export function EvidenceAiPanel({ evidence, uri, onSave, onApplyOdometer }: { onApplyOdometer?: (value: string) => void; evidence: EvidenceItem; uri: string; onSave: (item: Partial<EvidenceItem> & { ruleKey: string }) => void }) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [result, setResult] = useState<EvidenceAiResult | undefined>(evidence.aiAnalysis);
  const [values, setValues] = useState<Values | undefined>(result?.reviewed || result?.original);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setResult(evidence.aiAnalysis);
    setValues(evidence.aiAnalysis?.reviewed || evidence.aiAnalysis?.original);
    setError('');
  }, [uri, evidence.aiAnalysis]);
  const analyze = async () => {
    setBusy(true); setError('');
    try {
      const form = new FormData();
      await appendMedia(form, 'file', { uri, type: evidence.mimeType || 'image/jpeg', name: evidence.originalFileName || 'evidence.jpg' } as any);
      form.append('ruleKey', evidence.ruleKey);
      const response = await apiClient.uploadFormData<EvidenceAiResult>('/evidence-ai/analyze', form, undefined, 60000);
      if (!mounted.current) return;
      setResult(response); setValues(response.original);
      onSave({ ...evidence, aiAnalysisId: response.id, aiAnalysis: response });
    } catch (error) { setError(error instanceof Error ? error.message : 'AI analysis failed. Please retry.'); }
    finally { setBusy(false); }
  };
  const saveReview = async () => {
    if (!result || !values) return;
    setBusy(true); setError('');
    try {
      await apiClient.post('/evidence-ai/' + result.id + '/review', values);
      if (!mounted.current) return;
      const updated = { ...result, reviewed: values };
      setResult(updated);
      onSave({ ...evidence, aiAnalysisId: result.id, aiAnalysis: updated });
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save review. Please retry.'); }
    finally { setBusy(false); }
  };
  return <View style={{ padding: 12, gap: 10 }}>
    <Text style={{ fontWeight: '700' }}>AI evidence review</Text>
    <Text>AI suggestions require your review. You can edit every field before saving.</Text>
    <Button title={result ? 'Analyze photo again' : 'Analyze photo with AI'} onPress={analyze} disabled={busy} loading={busy} />
    {!!error && <Text accessibilityRole="alert" style={{ color: '#b91c1c' }}>{error}</Text>}
    {values && result && <>
      {(Object.keys(labels) as (keyof Values)[]).map(field => <View key={field}>
        <Text>{labels[field]}</Text>
        <TextInput accessibilityLabel={labels[field]} value={values[field]} editable={!busy} multiline onChangeText={text => setValues(current => current ? { ...current, [field]: text } : current)} style={{ borderWidth: 1, borderColor: '#cbd5e1', padding: 8, borderRadius: 8, color: '#0f172a' }} />
      </View>)}
      {onApplyOdometer && <Button title="Use this odometer reading" onPress={() => onApplyOdometer(values.odometer)} disabled={busy || !values.odometer.trim()} />}
      <Button title="Save reviewed AI results" onPress={saveReview} disabled={busy} />
      <Text>Original AI result</Text>
      <Text selectable>{Object.entries(result.original).map(([key, value]) => labels[key as keyof Values] + ': ' + (value || 'Unknown')).join('\n')}</Text>
    </>}
  </View>;
}
