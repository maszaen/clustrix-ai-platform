/**
 * RemindersScreen - Manage scheduled reminders
 * 
 * Follows the same pattern as AgenticToolsScreen
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Pressable, 
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import AlertModal from '../components/AlertModal';
import DateTimePicker from '@react-native-community/datetimepicker';

import { 
  getReminders, 
  saveReminder, 
  deleteReminder,
  completeReminder,
} from '../database/db';

// Quick time presets
const TIME_PRESETS = [
  { label: 'In 1 hour', getValue: () => { const d = new Date(); d.setHours(d.getHours() + 1); return d; } },
  { label: 'In 3 hours', getValue: () => { const d = new Date(); d.setHours(d.getHours() + 3); return d; } },
  { label: 'Tomorrow 9 AM', getValue: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
  { label: 'Tomorrow 6 PM', getValue: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return d; } },
  { label: 'In 1 week', getValue: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d; } },
  { label: 'Custom...', getValue: () => null },
];

// ============================================================
// ADD/EDIT FORM CONTENT
// ============================================================
export function ReminderFormContent({ editingReminder, onSave, onClose }) {
  const { currentUser } = useApp();
  const userId = currentUser?.id || currentUser?.uid;
  
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [notifDesc, setNotifDesc] = useState('');
  const [scheduledDate, setScheduledDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(null);
  
  useEffect(() => {
    if (editingReminder) {
      setTitle(editingReminder.title);
      setMessage(editingReminder.message || '');
      setNotifDesc(editingReminder.metadata?.notifDesc || '');
      setScheduledDate(new Date(editingReminder.scheduledDate));
    } else {
      const defaultDate = new Date();
      defaultDate.setHours(defaultDate.getHours() + 1);
      defaultDate.setMinutes(0);
      setTitle('');
      setMessage('');
      setNotifDesc('');
      setScheduledDate(defaultDate);
      setSelectedPreset(null);
    }
  }, [editingReminder]);
  
  const handlePresetSelect = (preset, index) => {
    const date = preset.getValue();
    if (date) {
      setScheduledDate(date);
      setSelectedPreset(index);
    } else {
      setShowDatePicker(true);
      setSelectedPreset(index);
    }
  };
  
  const handleSave = async () => {
    if (!title.trim() || !userId) return;
    if (scheduledDate <= new Date()) return;
    
    setSaving(true);
    try {
      if (editingReminder) {
        if (editingReminder.notificationId) {
          try {
            const { cancelNotification } = await import('../services/notifications');
            await cancelNotification(editingReminder.notificationId);
          } catch (e) {}
        }
        await deleteReminder(editingReminder.id, userId);
      }
      
      const reminderId = editingReminder?.id || `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const notificationBody = notifDesc.trim() || message.trim() || title.trim();
      
      let notificationId = '';
      try {
        const { scheduleNotification } = await import('../services/notifications');
        const result = await scheduleNotification({
          title: title.trim(),
          message: notificationBody,
          scheduledDate,
          metadata: { userId, reminderId },
        });
        if (result.success) notificationId = result.notificationId;
      } catch (e) {
        console.warn('[Reminders] Notification not available:', e.message);
      }
      
      const reminder = {
        id: reminderId,
        userId,
        title: title.trim(),
        message: message.trim() || title.trim(),
        scheduledDate: scheduledDate.toISOString(),
        notificationId,
        isCompleted: false,
        metadata: { notifDesc: notifDesc.trim() },
      };
      
      await saveReminder(reminder);
      onSave?.();
      onClose?.();
    } catch (error) {
      console.error('[Reminders] Save error:', error);
    } finally {
      setSaving(false);
    }
  };
  
  const onDateChange = (event, selected) => {
    setShowDatePicker(false);
    if (selected) {
      const newDate = new Date(scheduledDate);
      newDate.setFullYear(selected.getFullYear());
      newDate.setMonth(selected.getMonth());
      newDate.setDate(selected.getDate());
      setScheduledDate(newDate);
      setTimeout(() => setShowTimePicker(true), 300);
    }
  };
  
  const onTimeChange = (event, selected) => {
    setShowTimePicker(false);
    if (selected) {
      const newDate = new Date(scheduledDate);
      newDate.setHours(selected.getHours());
      newDate.setMinutes(selected.getMinutes());
      setScheduledDate(newDate);
    }
  };
  
  return (
    <>
      <View style={[styles.subContainer, styles.content]}>
        {/* Title */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="What to remind?"
            placeholderTextColor={COLORS.fgMuted}
            maxLength={100}
          />
        </View>
        
        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details (optional)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={message}
            onChangeText={setMessage}
            placeholder="Additional notes..."
            placeholderTextColor={COLORS.fgMuted}
            multiline
            numberOfLines={2}
            maxLength={300}
          />
        </View>
        
        {/* Notification Text */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Text (optional)</Text>
          <TextInput
            style={styles.input}
            value={notifDesc}
            onChangeText={setNotifDesc}
            placeholder="Custom push notification text"
            placeholderTextColor={COLORS.fgMuted}
            maxLength={200}
          />
          <Text style={styles.hint}>Leave empty to use title as notification text.</Text>
        </View>
        
        {/* When - Presets */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>When</Text>
          <View style={styles.presetGrid}>
            {TIME_PRESETS.map((preset, index) => (
              <Pressable
                key={index}
                style={[styles.presetBtn, selectedPreset === index && styles.presetBtnActive]}
                onPress={() => requestAnimationFrame(() => handlePresetSelect(preset, index))}
                android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
                delayPressIn={0}
              >
                <Text style={[styles.presetText, selectedPreset === index && styles.presetTextActive]}>
                  {preset.label}
                </Text>
              </Pressable>
            ))}
          </View>
          
          {/* Selected Time Display */}
          <Pressable 
            style={styles.timeDisplay} 
            onPress={() => requestAnimationFrame(() => setShowDatePicker(true))} 
            android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
            delayPressIn={0}
          >
            <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
            <Text style={styles.timeText}>
              {scheduledDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
            <Ionicons name="time-outline" size={18} color={COLORS.primary} />
            <Text style={styles.timeText}>
              {scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </Text>
          </Pressable>
        </View>
        
        {/* Save Button */}
        <View style={styles.section}>
          <Pressable 
            style={[styles.saveBtn, (!title.trim() || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!title.trim() || saving}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={COLORS.fg} />
            ) : (
              <Text style={styles.saveBtnText}>
                {editingReminder ? 'Save Changes' : 'Create Reminder'}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
      
      {showDatePicker && (
        <DateTimePicker value={scheduledDate} mode="date" display="default" onChange={onDateChange} minimumDate={new Date()} />
      )}
      {showTimePicker && (
        <DateTimePicker value={scheduledDate} mode="time" display="default" onChange={onTimeChange} />
      )}
    </>
  );
}

// ============================================================
// MAIN REMINDERS LIST
// ============================================================
export default function RemindersScreen({ onClose, onOpenAddForm, onOpenEditForm, refreshKey }) {
  const { currentUser } = useApp();
  const userId = currentUser?.id || currentUser?.uid;
  
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionTarget, setActionTarget] = useState(null);
  const [showActionAlert, setShowActionAlert] = useState(false);
  const [actionType, setActionType] = useState(null);
  
  const loadReminders = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const data = await getReminders(userId);
      const sorted = data.sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        return new Date(a.scheduledDate) - new Date(b.scheduledDate);
      });
      setReminders(sorted);
    } catch (error) {
      console.error('[Reminders] Load error:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);
  
  useEffect(() => {
    // Defer loading until after animations complete to prevent lag
    const { InteractionManager } = require('react-native');
    const task = InteractionManager.runAfterInteractions(() => {
      loadReminders();
    });
    return () => task.cancel();
  }, [loadReminders, refreshKey]);
  
  const handleAction = (reminder, type) => {
    setActionTarget(reminder);
    setActionType(type);
    setShowActionAlert(true);
  };
  
  const confirmAction = async () => {
    if (!actionTarget) return;
    try {
      if (actionTarget.notificationId) {
        try {
          const { cancelNotification } = await import('../services/notifications');
          await cancelNotification(actionTarget.notificationId);
        } catch (e) {}
      }
      
      if (actionType === 'complete') {
        await completeReminder(actionTarget.id, userId);
      } else {
        await deleteReminder(actionTarget.id, userId);
      }
      await loadReminders();
    } catch (error) {
      console.error('[Reminders] Action error:', error);
    } finally {
      setShowActionAlert(false);
      setActionTarget(null);
      setActionType(null);
    }
  };
  
  const formatDateTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    if (isToday) return `Today, ${time}`;
    if (isTomorrow) return `Tomorrow, ${time}`;
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + `, ${time}`;
  };
  
  const getTimeLeft = (dateStr, isCompleted) => {
    if (isCompleted) return 'Done';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date - now;
    if (diff < 0) return 'Overdue';
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h`;
    return `${Math.floor(diff / 60000)}m`;
  };
  
  const activeReminders = reminders.filter(r => !r.isCompleted);
  const completedReminders = reminders.filter(r => r.isCompleted);
  
  if (!userId) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="person-outline" size={40} color={COLORS.fgMuted} />
        <Text style={styles.emptyTitle}>Login Required</Text>
        <Text style={styles.emptyText}>Sign in to manage reminders.</Text>
      </View>
    );
  }
  
  return (
    <>
      <View style={[styles.subContainer, styles.content]}>
        {/* Add Button */}
        <View style={styles.section}>
          <Pressable 
            style={styles.addBtn}
            onPress={() => requestAnimationFrame(onOpenAddForm)}
            android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
            delayPressIn={0}
          >
            <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
            <Text style={styles.addBtnText}>Add Reminder</Text>
          </Pressable>
        </View>
        
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : reminders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={40} color={COLORS.fgMuted} />
            <Text style={styles.emptyTitle}>No Reminders</Text>
            <Text style={styles.emptyText}>Tap above to create one.</Text>
          </View>
        ) : (
          <>
            {/* Active Reminders */}
            {activeReminders.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Active ({activeReminders.length})</Text>
                {activeReminders.map((reminder) => (
                  <Pressable
                    key={reminder.id}
                    style={styles.reminderItem}
                    onPress={() => {
                        requestAnimationFrame(() => {
                           onOpenEditForm?.(reminder);
                        });
                    }}
                    android_ripple={{ color: 'rgba(255,255,255,0.08)', foreground: true }}
                    delayPressIn={0}
                  >
                    <View style={styles.reminderLeft}>
                      <Text style={styles.reminderTitle} numberOfLines={1}>{reminder.title}</Text>
                      <Text style={styles.reminderTime}>{formatDateTime(reminder.scheduledDate)}</Text>
                    </View>
                    <Text style={styles.reminderBadge}>{getTimeLeft(reminder.scheduledDate, false)}</Text>
                    <Pressable 
                        style={styles.iconBtn} 
                        onPress={() => handleAction(reminder, 'complete')} 
                        hitSlop={8} 
                        android_ripple={{ color: COLORS.success + '30', borderless: true }}
                        delayPressIn={0}
                    >
                      <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.success} />
                    </Pressable>
                    <Pressable 
                        style={styles.iconBtn} 
                        onPress={() => handleAction(reminder, 'delete')} 
                        hitSlop={8} 
                        android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
                        delayPressIn={0}
                    >
                      <Ionicons name="trash-outline" size={20} color={COLORS.fgMuted} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            )}
            
            {/* Completed Reminders */}
            {completedReminders.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Completed ({completedReminders.length})</Text>
                {completedReminders.map((reminder) => (
                  <Pressable
                    key={reminder.id}
                    style={[styles.reminderItem, styles.reminderItemCompleted]}
                    onPress={() => requestAnimationFrame(() => handleAction(reminder, 'delete'))}
                    android_ripple={{ color: 'rgba(255,255,255,0.02)' }}
                    delayPressIn={0}
                  >
                    <View style={styles.reminderLeft}>
                      <Text style={[styles.reminderTitle, styles.reminderTitleCompleted]} numberOfLines={1}>{reminder.title}</Text>
                      <Text style={styles.reminderTime}>Completed</Text>
                    </View>
                    <Pressable 
                        style={styles.iconBtn} 
                        onPress={() => requestAnimationFrame(() => handleAction(reminder, 'delete'))} 
                        hitSlop={8} 
                        android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
                        delayPressIn={0}
                    >
                      <Ionicons name="trash-outline" size={20} color={COLORS.fgMuted} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </View>
      
      <AlertModal
        visible={showActionAlert}
        title={actionType === 'complete' ? 'Complete Reminder' : 'Delete Reminder'}
        message={actionType === 'complete' ? `Mark "${actionTarget?.title}" as done?` : `Delete "${actionTarget?.title}"?`}
        icon={actionType === 'complete' ? 'checkmark-circle' : 'trash'}
        iconColor={actionType === 'complete' ? COLORS.success : COLORS.danger}
        primaryText={actionType === 'complete' ? 'Complete' : 'Delete'}
        secondaryText="Cancel"
        onPrimary={confirmAction}
        onSecondary={() => { setShowActionAlert(false); setActionTarget(null); setActionType(null); }}
        destructive={actionType === 'delete'}
      />
    </>
  );
}

const styles = StyleSheet.create({
  subContainer: { flex: 1, paddingTop: 10 },
  content: { paddingBottom: 40 },
  section: { marginBottom: 20 },
  sectionTitle: { 
    color: COLORS.fgMuted, 
    fontSize: 12, 
    fontFamily: FONTS.ai, 
    textTransform: 'uppercase', 
    letterSpacing: 0.5, 
    paddingHorizontal: 4, 
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 15,
    padding: 14,
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.sans,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  hint: {
    color: COLORS.fgMuted,
    fontSize: 12,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  presetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  presetBtnActive: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary,
  },
  presetText: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontFamily: FONTS.sans,
  },
  presetTextActive: {
    color: COLORS.primary,
    fontFamily: FONTS.display,
  },
  timeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.inputBg,
    borderRadius: 15,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  timeText: {
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 15,
    padding: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: COLORS.fg,
    fontSize: 15,
    fontFamily: FONTS.display,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary + '15',
    borderRadius: 15,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  addBtnText: {
    color: COLORS.primary,
    fontSize: 14,
    fontFamily: FONTS.display,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    color: COLORS.fg,
    fontSize: 16,
    fontFamily: FONTS.display,
    marginTop: 12,
  },
  emptyText: {
    color: COLORS.fgMuted,
    fontSize: 13,
    marginTop: 4,
  },
  reminderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 15,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  reminderItemCompleted: {
    opacity: 0.5,
  },
  reminderLeft: {
    flex: 1,
  },
  reminderTitle: {
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.display,
    marginBottom: 2,
  },
  reminderTitleCompleted: {
    textDecorationLine: 'line-through',
    color: COLORS.fgMuted,
  },
  reminderTime: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontFamily: FONTS.sans,
  },
  reminderBadge: {
    color: COLORS.primary,
    fontSize: 11,
    fontFamily: FONTS.display,
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 8,
  },
  iconBtn: {
    padding: 6,
  },
});
