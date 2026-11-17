import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Icon } from '../common/Icon';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { voiceRecordingService } from '../../services/voiceRecordingService';
import { VoiceNote } from '../../types';
import { removeMedia, resolveMedia } from '../../../web/storage';

interface VoiceToTechButtonProps {
  onTranscriptReady: (note: VoiceNote) => void;
  pinnedRuleKey?: string;
  ruleName?: string;
  promptSuggestion?: string;
}

export const VoiceToTechButton: React.FC<VoiceToTechButtonProps> = ({
  onTranscriptReady,
  pinnedRuleKey,
  ruleName,
  promptSuggestion,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [duration, setDuration] = useState(0);
  const [audioUri, setAudioUri] = useState<string | undefined>();
  const busyRef = useRef(false);
  const ownedRef = useRef(false);
  const unsavedAudio = useRef<string>(undefined);
  const mountedRef = useRef(true);
  const [transcriptionError, setTranscriptionError] = useState('');
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (ownedRef.current) voiceRecordingService.cancelRecording();
      if (unsavedAudio.current) void removeMedia(unsavedAudio.current).catch(console.warn);
    };
  }, []);

  const startRecording = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    ownedRef.current = true;
    setIsStarting(true);
    setTranscriptionError('');
    setDuration(0);
    setAudioUri(undefined);
    setTranscript('');

    try {
      if (await voiceRecordingService.startRecording(setDuration) && mountedRef.current) setIsRecording(true);
    } catch (error) {
      ownedRef.current = false;
      if (mountedRef.current) {
        setTranscriptionError(error instanceof Error ? error.message : 'Could not open the microphone.');
        setModalVisible(true);
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setIsStarting(false);
    }
  };

  const transcribe = async (existingAudio?: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsRecording(false);
    setIsTranscribing(true);
    setTranscriptionError('');
    setModalVisible(true);

    try {
      let uri = existingAudio;
      if (!uri) {
        const recording = await voiceRecordingService.stopRecording();
        ownedRef.current = false;
        uri = recording.audioUri;
        if (!mountedRef.current) {
          await removeMedia(uri);
          return;
        }
        unsavedAudio.current = uri;
        setAudioUri(uri);
        setDuration(Math.max(1, Math.round(recording.durationSeconds)));
      }
      const text = await voiceRecordingService.transcribe(uri);
      if (mountedRef.current) setTranscript(text);
    } catch (error) {
      if (mountedRef.current) setTranscriptionError(error instanceof Error ? error.message : 'Transcription failed.');
    } finally {
      ownedRef.current = false;
      busyRef.current = false;
      if (mountedRef.current) setIsTranscribing(false);
    }
  };

  const discardNote = () => {
    if (unsavedAudio.current) void removeMedia(unsavedAudio.current).catch(console.warn);
    unsavedAudio.current = undefined;
    setAudioUri(undefined);
    setModalVisible(false);
  };

  const handleSaveNote = () => {
    if (!transcript.trim()) return;

    const newNote: VoiceNote = {
      id: `vn_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      durationSeconds: duration,
      audioUri,
      transcript: transcript.trim(),
      recordedAt: new Date().toISOString(),
      pinnedToRuleKey: pinnedRuleKey,
      pinnedToEvidenceKey: pinnedRuleKey,
      isEdited: false,
    };

    onTranscriptReady(newNote);
    unsavedAudio.current = undefined;
    setModalVisible(false);
    setTranscript('');
  };


  return (
    <View style={styles.container}>
      <TouchableOpacity
        activeOpacity={0.85}
        accessibilityRole="button"
        disabled={isStarting || isTranscribing}
        onPress={() => isRecording ? void transcribe() : void startRecording()}
        style={[
          styles.holdButton,
          isRecording && styles.holdButtonRecording,
        ]}
      >
        <View style={styles.iconCircle}>
          <Icon
            name="mic"
            size={22}
            color={isRecording ? colors.danger : colors.primaryLight}
          />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.buttonTitle}>
            {isStarting ? 'Opening Microphone…' : isRecording ? 'Listening… Tap to Stop' : 'Start Dictation'}
          </Text>
          <Text style={styles.buttonSubtitle}>
            {promptSuggestion || 'Voice to Tech · Australian Workshop STT'}
          </Text>
        </View>
        {isRecording && (
          <Badge label={`${duration}s`} variant="danger" size="sm" />
        )}
      </TouchableOpacity>

      {/* Transcript Review Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Icon name="sparkles" size={20} color={colors.primary} />
                <Text style={styles.modalTitle}>Voice to Tech Transcript</Text>
              </View>
            </View>

            {ruleName && (
              <View style={styles.pinnedBadgeRow}>
                <Icon name="pin" size={14} color={colors.primaryLight} />
                <Text style={styles.pinnedText}>Pinned to: {ruleName}</Text>
              </View>
            )}

            {isTranscribing ? (
              <View style={styles.transcribingState}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.transcribingText}>
                  Processing workshop audio through Voice-to-Tech...
                </Text>
              </View>
            ) : (
              <View style={styles.transcriptInputContainer}>
                {!!transcriptionError && <Text style={{ color: colors.danger, marginBottom: 8 }}>{transcriptionError}</Text>}
                <Text style={styles.editPromptText}>
                  {transcriptionError ? 'You can type and attach your note below.' : 'Review and edit the transcript before attaching it.'}
                </Text>
                {audioUri && <audio controls src={resolveMedia(audioUri)} aria-label="Recorded note" style={{ width: '100%' }} />}
                {audioUri && transcriptionError && (
                  <Button title="Retry Transcription" variant="ghost" onPress={() => void transcribe(audioUri)} />
                )}
                <TextInput
                  multiline
                  value={transcript}
                  onChangeText={setTranscript}
                  style={styles.transcriptInput}
                  placeholder="Technician notes..."
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={discardNote}
                disabled={isTranscribing}
                style={{ flex: 1 }}
              />
              <Button
                title="Attach Note"
                variant="primary"
                onPress={handleSaveNote}
                disabled={isTranscribing || !transcript.trim()}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.xs,
  },
  holdButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
    borderRadius: spacing.borderRadius.lg,
    padding: spacing.md,
    minHeight: spacing.minTapTarget,
  },
  holdButtonRecording: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerLight,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  buttonSubtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  pinnedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryGlow,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: spacing.borderRadius.sm,
    marginBottom: spacing.md,
    gap: 4,
  },
  pinnedText: {
    fontSize: typography.sizes.xs,
    color: colors.primaryLight,
    fontWeight: typography.weights.medium,
  },
  transcribingState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  transcribingText: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    marginTop: spacing.md,
  },
  transcriptInputContainer: {
    marginBottom: spacing.lg,
  },
  editPromptText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  transcriptInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: spacing.borderRadius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.borderHighlight,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
