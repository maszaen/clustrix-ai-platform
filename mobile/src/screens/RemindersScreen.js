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
  Pressable, 
  TextInput,
  ActivityIndicator,
  Platform,
  AppState,
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
import { BellOff, BellPlus } from 'lucide-react-native';

// Quick time presets for setting the main reminder time (no Custom button - use time container)
const TIME_PRESETS = [
  { label: 'In 1 hour', getValue: () => { const d = new Date(); d.setHours(d.getHours() + 1); d.setMinutes(0, 0, 0); return d; } },
  { label: 'In 3 hours', getValue: () => { const d = new Date(); d.setHours(d.getHours() + 3); d.setMinutes(0, 0, 0); return d; } },
  { label: 'Tomorrow 9 AM', getValue: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
  { label: 'Tomorrow 6 PM', getValue: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return d; } },
  { label: 'Next week', getValue: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d; } },
];

/**
 * Get available "Remind me before" options based on time distance
 * @param {Date} scheduledDate - The main reminder time
 * @returns {Array} Available pre-reminder options
 */
function getAvailableWhenOptions(scheduledDate) {
  if (!scheduledDate) return [];
  
  const now = Date.now();
  const targetTime = scheduledDate.getTime();
  const diffMs = targetTime - now;
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;
  const diffWeeks = diffDays / 7;
  const diffMonths = diffDays / 30;
  
  const options = [];
  
  // > 3 hours: show 1 hour option
  if (diffHours > 3) {
    options.push({ label: '1 hour before', minutes: 60 });
  }
  
  // > 5 hours: show 3 hours option
  if (diffHours > 5) {
    options.push({ label: '3 hours before', minutes: 180 });
  }
  
  // > 1 day: show 1 day option
  if (diffDays > 1) {
    options.push({ label: '1 day before', minutes: 1440 });
  }
  
  // > 2 weeks: show 1 week option
  if (diffWeeks > 2) {
    options.push({ label: '1 week before', minutes: 10080 });
  }
  
  // > 2 months: show 1 month option
  if (diffMonths > 2) {
    options.push({ label: '1 month before', minutes: 43200 });
  }
  
  return options;
}

// ============================================================
// ADD/EDIT FORM CONTENT
// ============================================================
export function ReminderFormContent({ editingReminder, onSave, onClose }) {
  const { currentUser } = useApp();
  const userId = currentUser?.id || currentUser?.uid;
  
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [notifDesc, setNotifDesc] = useState('');
  // Start with null - user must set time explicitly
  const [scheduledDate, setScheduledDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(null);
  // Track if user used custom picker (hides preset shortcuts)
  const [isCustomTime, setIsCustomTime] = useState(false);
  // "Remind me before" selection (optional pre-reminder)
  const [selectedWhen, setSelectedWhen] = useState(null);
  
  // Calculate available WHEN options based on scheduled time
  const whenOptions = scheduledDate ? getAvailableWhenOptions(scheduledDate) : [];
  
  useEffect(() => {
    if (editingReminder) {
      setTitle(editingReminder.title);
      setMessage(editingReminder.message || '');
      setNotifDesc(editingReminder.metadata?.notifDesc || '');
      setScheduledDate(new Date(editingReminder.scheduledDate));
      // Restore selected WHEN if exists
      if (editingReminder.metadata?.whenMinutes) {
        setSelectedWhen(editingReminder.metadata.whenMinutes);
      }
    } else {
      // Reset form - scheduledDate starts as null
      setTitle('');
      setMessage('');
      setNotifDesc('');
      setScheduledDate(null);
      setSelectedPreset(null);
      setIsCustomTime(false);
      setSelectedWhen(null);
    }
  }, [editingReminder]);
  
  // Reset WHEN selection if it's no longer valid after time change
  useEffect(() => {
    if (selectedWhen && whenOptions.length > 0) {
      const stillValid = whenOptions.some(opt => opt.minutes === selectedWhen);
      if (!stillValid) {
        setSelectedWhen(null);
      }
    }
  }, [scheduledDate, whenOptions, selectedWhen]);
  
  const handlePresetSelect = (preset, index) => {
    // Toggle off if clicking the same preset
    if (selectedPreset === index) {
      setScheduledDate(null);
      setSelectedPreset(null);
      setIsCustomTime(false);
      return;
    }
    
    const value = preset.getValue();
    if (value) {
      setScheduledDate(value);
      setSelectedPreset(index);
      setIsCustomTime(false); // Using shortcut, not custom
    }
  };
  
  // Open custom date picker (from time container)
  const handleCustomTimePress = () => {
    setShowDatePicker(true);
    // Will mark as custom after user selects date
  };
  
  const handleSave = async () => {
    // Validate: must have title, userId, and scheduledDate
    if (!title.trim() || !userId || !scheduledDate) return;
    if (scheduledDate <= new Date()) return;
    
    setSaving(true);
    try {
      // Cancel old notifications if editing
      if (editingReminder) {
        const { cancelNotification } = await import('../services/notifications');
        // Cancel all notification IDs (main + pre-reminders)
        const oldNotifIds = [
          editingReminder.notificationId,
          editingReminder.metadata?.autoPreNotifId,
          editingReminder.metadata?.whenNotifId,
        ].filter(Boolean);
        
        for (const nid of oldNotifIds) {
          try { await cancelNotification(nid); } catch (e) {}
        }
        await deleteReminder(editingReminder.id, userId);
      }
      
      const reminderId = editingReminder?.id || `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const notificationBody = notifDesc.trim() || message.trim() || title.trim();
      const { scheduleNotification } = await import('../services/notifications');
      
      // Calculate time differences
      const now = Date.now();
      const targetTime = scheduledDate.getTime();
      const diffMinutes = (targetTime - now) / (1000 * 60);
      
      // ========================================
      // NOTIFICATION 1: Main reminder (WAJIB)
      // ========================================
      let mainNotifId = '';
      try {
        const result = await scheduleNotification({
          title: title.trim(),
          message: notificationBody,
          scheduledDate,
          metadata: { userId, reminderId, type: 'main' },
        });
        if (result.success) mainNotifId = result.notificationId;
      } catch (e) {
        console.warn('[Reminders] Main notification failed:', e.message);
      }
      
      // ========================================
      // NOTIFICATION 2: Auto pre-reminder (WAJIB if > 30 min)
      // - > 90 minutes: 1 hour before
      // - > 30 minutes but <= 90: 30 minutes before
      // ========================================
      let autoPreNotifId = '';
      if (diffMinutes > 30) {
        const autoPreMinutes = diffMinutes > 90 ? 60 : 30;
        const autoPreDate = new Date(targetTime - autoPreMinutes * 60 * 1000);
        
        // Only schedule if it's in the future
        if (autoPreDate.getTime() > now) {
          try {
            const preLabel = autoPreMinutes === 60 ? '1 hour' : '30 minutes';
            const result = await scheduleNotification({
              title: `⏰ ${preLabel} left: ${title.trim()}`,
              message: notificationBody,
              scheduledDate: autoPreDate,
              metadata: { userId, reminderId, type: 'auto-pre' },
            });
            if (result.success) autoPreNotifId = result.notificationId;
          } catch (e) {
            console.warn('[Reminders] Auto pre-notification failed:', e.message);
          }
        }
      }
      
      // ========================================
      // NOTIFICATION 3: User-selected WHEN (OPTIONAL)
      // ========================================
      let whenNotifId = '';
      if (selectedWhen) {
        const whenDate = new Date(targetTime - selectedWhen * 60 * 1000);
        
        // Only schedule if it's in the future and different from auto pre-reminder
        if (whenDate.getTime() > now) {
          // Avoid duplicate: don't schedule if same as auto pre-reminder (within 5 min tolerance)
          const autoPreMinutes = diffMinutes > 90 ? 60 : 30;
          const isDuplicate = Math.abs(selectedWhen - autoPreMinutes) < 5;
          
          if (!isDuplicate) {
            try {
              const whenOpt = whenOptions.find(o => o.minutes === selectedWhen);
              const whenLabel = whenOpt?.label || `${selectedWhen} min before`;
              const result = await scheduleNotification({
                title: `📅 Reminder: ${title.trim()}`,
                message: `${whenLabel} - ${notificationBody}`,
                scheduledDate: whenDate,
                metadata: { userId, reminderId, type: 'when-pre' },
              });
              if (result.success) whenNotifId = result.notificationId;
            } catch (e) {
              console.warn('[Reminders] WHEN notification failed:', e.message);
            }
          }
        }
      }
      
      // Save reminder to database with all notification IDs
      const reminder = {
        id: reminderId,
        userId,
        title: title.trim(),
        message: message.trim() || title.trim(),
        scheduledDate: scheduledDate.toISOString(),
        notificationId: mainNotifId,
        isCompleted: false,
        metadata: { 
          notifDesc: notifDesc.trim(),
          autoPreNotifId,
          whenNotifId,
          whenMinutes: selectedWhen,
        },
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
      // If scheduledDate is null, create new date, otherwise update existing
      const newDate = scheduledDate ? new Date(scheduledDate) : new Date();
      newDate.setFullYear(selected.getFullYear());
      newDate.setMonth(selected.getMonth());
      newDate.setDate(selected.getDate());
      // If first time setting, default to next hour
      if (!scheduledDate) {
        newDate.setHours(newDate.getHours() + 1, 0, 0, 0);
      }
      setScheduledDate(newDate);
      // Mark as custom time (hide presets), clear preset selection
      setIsCustomTime(true);
      setSelectedPreset(null);
      setTimeout(() => setShowTimePicker(true), 300);
    }
  };
  
  const onTimeChange = (event, selected) => {
    setShowTimePicker(false);
    if (selected && scheduledDate) {
      const newDate = new Date(scheduledDate);
      newDate.setHours(selected.getHours());
      newDate.setMinutes(selected.getMinutes());
      setScheduledDate(newDate);
    }
  };
  
  // Check if save is allowed
  const canSave = title.trim() && scheduledDate && scheduledDate > new Date();
  
  return (
    <>
      <View style={[styles.subContainer, styles.content]}>
        {/* Title */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reminder Title</Text>
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
        </View>
        
        {/* Schedule Time - Presets (hide if user used custom picker) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          
          {/* Show preset shortcuts only if user hasn't used custom picker */}
          {!isCustomTime && (
            <View style={[styles.presetGrid, {marginBottom: 10}]}>
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
          )}
          
          {/* Time Display - always clickable (for custom time selection) */}
          <Pressable 
            style={[styles.timeDisplay, !scheduledDate && styles.timeDisplayEmpty]} 
            onPress={() => requestAnimationFrame(() => handleCustomTimePress())} 
            android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
            delayPressIn={0}
          >
            {scheduledDate ? (
              <>
                <View style={styles.timeRowIcon}>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.timeText}>
                    {scheduledDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                </View>
                <View style={styles.timeRowIcon}>
                  <Ionicons name="time-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.timeText}>
                    {scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Ionicons name="calendar-outline" size={18} color={COLORS.fgMuted} />
                <Text style={styles.noTimeText}>Tap to select date & time</Text>
              </>
            )}
          </Pressable>
        </View>
        
        {/* Remind Me Before - Only show if time is set and options available */}
        {scheduledDate && whenOptions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Remind me before (optional)</Text>
            <View style={styles.presetGrid}>
              {whenOptions.map((option, index) => (
                <Pressable
                  key={index}
                  style={[
                    styles.presetBtn, 
                    styles.whenBtn,
                    selectedWhen === option.minutes && styles.presetBtnActive
                  ]}
                  onPress={() => {
                    // Toggle selection
                    setSelectedWhen(selectedWhen === option.minutes ? null : option.minutes);
                  }}
                  android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
                  delayPressIn={0}
                >
                  <Text style={[
                    styles.presetText, 
                    selectedWhen === option.minutes && styles.presetTextActive
                  ]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        
        {/* Save Button */}
        <View style={styles.section}>
          <Pressable 
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave || saving}
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
          {/* {!scheduledDate && (
            <Text style={styles.hintCenter}>Please select a schedule time first</Text>
          )} */}
        </View>
      </View>
      
      {showDatePicker && (
        <DateTimePicker 
          value={scheduledDate || new Date()} 
          mode="date" 
          display="default" 
          onChange={onDateChange} 
          minimumDate={new Date()} 
        />
      )}
      {showTimePicker && scheduledDate && (
        <DateTimePicker 
          value={scheduledDate} 
          mode="time" 
          display="default" 
          onChange={onTimeChange} 
        />
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
  const [hasAlarmPermission, setHasAlarmPermission] = useState(true);
  
  // Check exact alarm permission (Android 12+)
  // expo-notifications handles this gracefully, so we always return true
  const checkAlarmPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const { canScheduleExactAlarms } = await import('../services/notifications');
        const canSchedule = await canScheduleExactAlarms();
        setHasAlarmPermission(canSchedule);
      } catch (e) {
        console.warn('[Reminders] Alarm permission check failed:', e);
        // expo-notifications handles fallback gracefully, so set to true
        setHasAlarmPermission(true);
      }
    }
  }, []);
  
  // Check permission on mount and when app returns to foreground
  useEffect(() => {
    checkAlarmPermission();
    
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkAlarmPermission();
      }
    });
    
    return () => subscription.remove();
  }, [checkAlarmPermission]);
  
  const handleGrantPermission = async () => {
    try {
      const { openAlarmPermissionSettings } = await import('../services/notifications');
      await openAlarmPermissionSettings();
    } catch (e) {
      console.error('[Reminders] Open settings failed:', e);
    }
  };
  
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
        {/* Permission Banner */}
        {!hasAlarmPermission && (
          <Pressable 
            style={styles.permissionBanner}
            onPress={handleGrantPermission}
            android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
          >
            <Ionicons name="alert-circle-outline" size={20} color={COLORS.warning} />
            <Text style={styles.permissionText}>
              Tap to grant alarm permission for scheduled reminders
            </Text>
            <Ionicons name="chevron-forward" size={18} color={COLORS.fgMuted} />
          </Pressable>
        )}
        
        {/* Add Button */}
        <View style={styles.section}>
          <Pressable 
            style={styles.addBtn}
            onPress={() => requestAnimationFrame(onOpenAddForm)}
            android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
            delayPressIn={0}
          >
            <BellPlus strokeWidth={1.5} size={20} color={COLORS.primary} />
            <Text style={styles.addBtnText}>Schedule Reminder</Text>
          </Pressable>
        </View>
        
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : reminders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <BellOff strokeWidth={1} size={45} color={COLORS.fgMuted} />
            <Text style={styles.emptyTitle}>No Reminders</Text>
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
        message={
          actionType === 'complete'
            ? `Mark "${actionTarget?.title}" as done? This will move it to your completed reminders.`
            : `Delete "${actionTarget?.title}"? This action can’t be undone.`
        }
        icon={actionType === 'complete' ? 'checkmark-circle' : 'trash'}
        iconColor={actionType === 'complete' ? COLORS.success : COLORS.danger}
        primaryText={actionType === 'complete' ? 'Complete' : 'Delete'}
        secondaryText="Cancel"
        onPrimary={confirmAction}
        danger={actionType === 'delete'}
        funcOnPress={actionType === 'complete'}
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
    rowGap: 8,
    gap: 7,
  },
  presetBtn: {
    paddingHorizontal: 16,
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
  },
  timeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: COLORS.inputBg,
    borderRadius: 15,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  timeDisplayEmpty: {
    gap: 10,
  },
  timeRowIcon: {
    gap: 10,
    display: 'flex',
    flexDirection: 'row',
  },
  timeText: {
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.displayItalic,
  },
  noTimeText: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.sans,
    fontStyle: 'italic',
  },
  whenBtn: {
    backgroundColor: COLORS.inputBg,
  },
  hintCenter: {
    color: COLORS.fgMuted,
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  saveBtn: {
    backgroundColor: COLORS.accent,
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
    fontFamily: FONTS.displayItalic,
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
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.warning + '15',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
  },
  permissionText: {
    flex: 1,
    color: COLORS.warning,
    fontSize: 13,
    fontFamily: FONTS.sans,
  },
});
