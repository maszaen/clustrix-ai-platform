import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  bg: '#282A2C',
  itemBg: 'transparent',
  itemActiveBg: '#333537',
  fg: '#FCFCFC',
  fgMuted: '#BDC1C6',
  accent: '#0e4bae',
  primary: '#D3E3FD',
  borderLight: '#3c4141',
  inputBg: '#1f1f1f',
};

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
  return date.toLocaleDateString();
}

function SessionItem({ session, isActive, onSelect, onDelete }) {
  const handleDelete = () => {
    Alert.alert(
      'Delete Chat',
      `Delete "${session.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(session.id) },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={[styles.item, isActive && styles.itemActive]}
      onPress={() => onSelect(session)}
      onLongPress={handleDelete}
    >
      <Ionicons name="chatbubble-outline" size={16} color={isActive ? COLORS.fg : COLORS.fgMuted} style={styles.itemIcon} />
      <View style={styles.itemContent}>
        <Text style={[styles.itemTitle, isActive && styles.itemTitleActive]} numberOfLines={1}>
          {session.name || 'New Chat'}
        </Text>
        <Text style={styles.itemTime}>{formatTime(session.updated_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function SessionList({ sessions, currentSession, onSelect, onDelete, onNew }) {
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredSessions = searchQuery 
    ? sessions.filter(s => s.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : sessions;

  return (
    <View style={styles.container}>
      {/* Logo Header */}
      <View style={styles.logoHeader}>
        <Image 
          source={require('../../assets/icon.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.logoText}>Clustrix</Text>
      </View>
      
      {/* New Chat Button */}
      <TouchableOpacity style={styles.newButton} onPress={onNew} activeOpacity={0.7}>
        <Ionicons name="add-circle" size={20} color={COLORS.fg} />
        <Text style={styles.newButtonText}>New Chat</Text>
      </TouchableOpacity>
      
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color={COLORS.fgMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search chats..."
          placeholderTextColor={COLORS.fgMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color={COLORS.fgMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
      
      {/* Session List */}
      <FlatList
        data={filteredSessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SessionItem
            session={item}
            isActive={currentSession?.id === item.id}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {searchQuery ? 'No chats found' : 'No chats yet'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  logoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  logoText: {
    color: COLORS.fg,
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
  },
  newButtonText: {
    color: COLORS.fg,
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  searchInput: {
    flex: 1,
    color: COLORS.fg,
    fontSize: 14,
    marginLeft: 8,
    paddingVertical: 0,
  },
  list: {
    paddingHorizontal: 8,
    paddingBottom: 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 2,
  },
  itemActive: {
    backgroundColor: COLORS.itemActiveBg,
  },
  itemIcon: {
    marginRight: 10,
  },
  itemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTitle: {
    color: COLORS.fgMuted,
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  itemTitleActive: {
    color: COLORS.fg,
  },
  itemTime: {
    color: COLORS.fgMuted,
    fontSize: 11,
    opacity: 0.7,
  },
  emptyText: {
    color: COLORS.fgMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
});
