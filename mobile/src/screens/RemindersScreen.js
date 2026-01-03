/**
 * RemindersScreen - Manage scheduled reminders
 * 
 * Features:
 * - View all reminders
 * - Add new reminder
 * - Edit existing reminder
 * - Mark as complete (delete)
 * - Delete reminder
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
  Alert,
} from 'react-native';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { 
  Bell, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  Calendar,
  Clock,
  AlertCircle,
} from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import SlideUpModal from '../components/SlideUpModal';
import AlertModal from '../components/AlertModal';
import DateTimePicker from '@react-native-community/datetimepicker';

// Import database functions
import { 
  getReminders, 
  saveReminder, 
  deleteReminder, 
  getReminder,
} from '../database/db';

export default function RemindersScreen({ onClose }) {
  const { currentUser } = useApp();
  const userId = currentUser?.id || currentUser?.uid;
  
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Form state
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [scheduledDate, setScheduledDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Load reminders
  const loadReminders = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const data = await getReminders(userId);
      // Filter only future reminders
      const now = new Date();
      const futureReminders = data.filter(r => new Date(r.scheduledDate) > now);
      setReminders(futureReminders);
    } catch (error) {
      console.error('[Reminders] Load error:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);
  
  useEffect(() => {
    loadReminders();
  }, [loadReminders]);
  
  // Reset form
  const resetForm = () => {
    setTitle('');
    setMessage('');
    // Default to 1 hour from now
    const defaultDate = new Date();
    defaultDate.setHours(defaultDate.getHours() + 1);
    defaultDate.setMinutes(0);
    setScheduledDate(defaultDate);
  };
  
  // Open add modal
  const handleOpenAdd = () => {
    resetForm();
    setShowAddModal(true);
  };
  
  // Open edit modal
  const handleOpenEdit = (reminder) => {
    setEditingReminder(reminder);
    setTitle(reminder.title);
    setMessage(reminder.message);
    setScheduledDate(new Date(reminder.scheduledDate));
    setShowEditModal(true);
  };
  
  // Save new reminder
  const handleSaveNew = async () => {
    if (!title.trim() || !message.trim()) {
      Alert.alert('Error', 'Please fill in title and message');
      return;
    }
    
    if (scheduledDate <= new Date()) {
      Alert.alert('Error', 'Scheduled time must be in the future');
      return;
    }
    
    setSaving(true);
    try {
      const reminderId = `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Try to schedule notification
      let notificationId = '';
      try {
        const { scheduleNotification } = await import('../services/notifications');
        const result = await scheduleNotification({
          title: title.trim(),
          message: message.trim(),
          scheduledDate,
          metadata: { userId },
        });
        if (result.success) {
          notificationId = result.notificationId;
        }
      } catch (e) {
        console.warn('[Reminders] Notification not available:', e.message);
      }
      
      const reminder = {
        id: reminderId,
        userId,
        title: title.trim(),
        message: message.trim(),
        scheduledDate: scheduledDate.toISOString(),
        notificationId,
        metadata: {},
      };
      
      await saveReminder(reminder);
      await loadReminders();
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };
  
  // Save edited reminder
  const handleSaveEdit = async () => {
    if (!editingReminder) return;
    
    if (!title.trim() || !message.trim()) {
      Alert.alert('Error', 'Please fill in title and message');
      return;
    }
    
    if (scheduledDate <= new Date()) {
      Alert.alert('Error', 'Scheduled time must be in the future');
      return;
    }
    
    setSaving(true);
    try {
      // Delete old and create new (simpler than update)
      // Cancel old notification
      if (editingReminder.notificationId) {
        try {
          const { cancelNotification } = await import('../services/notifications');
          await cancelNotification(editingReminder.notificationId);
        } catch (e) {
          console.warn('[Reminders] Could not cancel old notification:', e.message);
        }
      }
      
      await deleteReminder(editingReminder.id, userId);
      
      // Schedule new notification
      let notificationId = '';
      try {
        const { scheduleNotification } = await import('../services/notifications');
        const result = await scheduleNotification({
          title: title.trim(),
          message: message.trim(),
          scheduledDate,
          metadata: { userId },
        });
        if (result.success) {
          notificationId = result.notificationId;
        }
      } catch (e) {
        console.warn('[Reminders] Notification not available:', e.message);
      }
      
      const reminder = {
        id: editingReminder.id, // Keep same ID
        userId,
        title: title.trim(),
        message: message.trim(),
        scheduledDate: scheduledDate.toISOString(),
        notificationId,
        metadata: {},
      };
      
      await saveReminder(reminder);
      await loadReminders();
      setShowEditModal(false);
      setEditingReminder(null);
      resetForm();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };
  
  // Delete/complete reminder
  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      // Cancel notification
      if (deleteTarget.notificationId) {
        try {
          const { cancelNotification } = await import('../services/notifications');
          await cancelNotification(deleteTarget.notificationId);
        } catch (e) {
          console.warn('[Reminders] Could not cancel notification:', e.message);
        }
      }
      
      await deleteReminder(deleteTarget.id, userId);
      await loadReminders();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    }
  };
  
  // Format date for display
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };
  
  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };
  
  // Handle date picker
  const onDateChange = (event, selected) => {
    setShowDatePicker(false);
    if (selected) {
      const newDate = new Date(scheduledDate);
      newDate.setFullYear(selected.getFullYear());
      newDate.setMonth(selected.getMonth());
      newDate.setDate(selected.getDate());
      setScheduledDate(newDate);
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
  
  // Not logged in
  if (!userId) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <AlertCircle size={48} color={COLORS.fgMuted} />
          <Text style={styles.emptyTitle}>Login Required</Text>
          <Text style={styles.emptyText}>
            Please log in to manage your reminders.
          </Text>
        </View>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      {/* Header with Add button */}
      <View style={styles.header}>
        <Text style={styles.headerText}>
          {reminders.length} reminder{reminders.length !== 1 ? 's' : ''}
        </Text>
        <Pressable 
          style={styles.addButton} 
          onPress={handleOpenAdd}
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
        >
          <Plus size={18} color={COLORS.fg} />
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
      
      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : reminders.length === 0 ? (
        <View style={styles.emptyState}>
          <Bell size={48} color={COLORS.fgMuted} />
          <Text style={styles.emptyTitle}>No Reminders</Text>
          <Text style={styles.emptyText}>
            Tap the Add button to create your first reminder, or ask Clustrix AI to set one for you.
          </Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {reminders.map((reminder) => (
            <Animated.View 
              key={reminder.id}
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(150)}
              layout={Layout.springify()}
              style={styles.reminderCard}
            >
              <View style={styles.reminderInfo}>
                <Text style={styles.reminderTitle} numberOfLines={2}>
                  {reminder.title}
                </Text>
                <Text style={styles.reminderMessage} numberOfLines={2}>
                  {reminder.message}
                </Text>
                <View style={styles.reminderMeta}>
                  <Calendar size={12} color={COLORS.fgMuted} />
                  <Text style={styles.reminderDate}>
                    {formatDate(reminder.scheduledDate)}
                  </Text>
                  <Clock size={12} color={COLORS.fgMuted} />
                  <Text style={styles.reminderDate}>
                    {formatTime(reminder.scheduledDate)}
                  </Text>
                </View>
              </View>
              
              <View style={styles.reminderActions}>
                <Pressable 
                  style={styles.actionButton}
                  onPress={() => handleOpenEdit(reminder)}
                  android_ripple={{ color: 'rgba(255,255,255,0.1)', borderless: true }}
                >
                  <Edit3 size={16} color={COLORS.fgMuted} />
                </Pressable>
                <Pressable 
                  style={[styles.actionButton, styles.completeButton]}
                  onPress={() => {
                    setDeleteTarget(reminder);
                    setShowDeleteConfirm(true);
                  }}
                  android_ripple={{ color: 'rgba(255,255,255,0.1)', borderless: true }}
                >
                  <Check size={16} color={COLORS.success} />
                </Pressable>
                <Pressable 
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => {
                    setDeleteTarget(reminder);
                    setShowDeleteConfirm(true);
                  }}
                  android_ripple={{ color: 'rgba(255,255,255,0.1)', borderless: true }}
                >
                  <Trash2 size={16} color={COLORS.danger} />
                </Pressable>
              </View>
            </Animated.View>
          ))}
        </ScrollView>
      )}
      
      {/* Add/Edit Modal */}
      <SlideUpModal
        visible={showAddModal || showEditModal}
        onClose={() => {
          setShowAddModal(false);
          setShowEditModal(false);
          setEditingReminder(null);
          resetForm();
        }}
        title={showEditModal ? 'Edit Reminder' : 'New Reminder'}
      >
        <View style={styles.formContainer}>
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Title</Text>
            <TextInput
              style={styles.formInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Reminder title"
              placeholderTextColor={COLORS.fgMuted}
              maxLength={100}
            />
          </View>
          
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Message</Text>
            <TextInput
              style={[styles.formInput, styles.formInputMultiline]}
              value={message}
              onChangeText={setMessage}
              placeholder="What should I remind you about?"
              placeholderTextColor={COLORS.fgMuted}
              multiline
              numberOfLines={3}
              maxLength={500}
            />
          </View>
          
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>When</Text>
            <View style={styles.dateTimeRow}>
              <Pressable 
                style={styles.dateTimeButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Calendar size={16} color={COLORS.primary} />
                <Text style={styles.dateTimeText}>
                  {scheduledDate.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
              </Pressable>
              <Pressable 
                style={styles.dateTimeButton}
                onPress={() => setShowTimePicker(true)}
              >
                <Clock size={16} color={COLORS.primary} />
                <Text style={styles.dateTimeText}>
                  {scheduledDate.toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                  })}
                </Text>
              </Pressable>
            </View>
          </View>
          
          <Pressable 
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={showEditModal ? handleSaveEdit : handleSaveNew}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={COLORS.fg} />
            ) : (
              <Text style={styles.saveButtonText}>
                {showEditModal ? 'Save Changes' : 'Create Reminder'}
              </Text>
            )}
          </Pressable>
        </View>
      </SlideUpModal>
      
      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={scheduledDate}
          mode="date"
          display="default"
          onChange={onDateChange}
          minimumDate={new Date()}
        />
      )}
      
      {/* Time Picker */}
      {showTimePicker && (
        <DateTimePicker
          value={scheduledDate}
          mode="time"
          display="default"
          onChange={onTimeChange}
        />
      )}
      
      {/* Delete Confirmation */}
      <AlertModal
        visible={showDeleteConfirm}
        title="Complete Reminder?"
        message={`Are you sure you want to complete/delete "${deleteTarget?.title}"?`}
        icon="checkmark-circle"
        iconColor={COLORS.success}
        primaryText="Complete"
        secondaryText="Cancel"
        onPrimary={handleDelete}
        onSecondary={() => {
          setShowDeleteConfirm(false);
          setDeleteTarget(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  headerText: {
    color: COLORS.fgMuted,
    fontSize: 13,
    fontFamily: FONTS.sans,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: COLORS.fg,
    fontSize: 13,
    fontFamily: FONTS.display,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  emptyTitle: {
    color: COLORS.fg,
    fontSize: 18,
    fontFamily: FONTS.display,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  reminderCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  reminderInfo: {
    flex: 1,
    marginRight: 10,
  },
  reminderTitle: {
    color: COLORS.fg,
    fontSize: 15,
    fontFamily: FONTS.display,
    marginBottom: 4,
  },
  reminderMessage: {
    color: COLORS.fgMuted,
    fontSize: 13,
    fontFamily: FONTS.sans,
    marginBottom: 8,
    lineHeight: 18,
  },
  reminderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reminderDate: {
    color: COLORS.fgMuted,
    fontSize: 11,
    fontFamily: FONTS.sans,
    marginRight: 8,
  },
  reminderActions: {
    justifyContent: 'center',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: COLORS.bgSecondary,
  },
  completeButton: {
    backgroundColor: COLORS.success + '20',
  },
  deleteButton: {
    backgroundColor: COLORS.danger + '20',
  },
  formContainer: {
    paddingHorizontal: 4,
    paddingBottom: 20,
  },
  formSection: {
    marginBottom: 18,
  },
  formLabel: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontFamily: FONTS.sans,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    padding: 14,
    color: COLORS.fg,
    fontSize: 15,
    fontFamily: FONTS.sans,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  formInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  dateTimeText: {
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: COLORS.fg,
    fontSize: 15,
    fontFamily: FONTS.display,
  },
});
