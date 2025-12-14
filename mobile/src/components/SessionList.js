import React, { useState, useRef, memo } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import ContextMenu from './ContextMenu';
import ConfirmModal from './ConfirmModal';
import InputModal from './InputModal';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import { LucideSearch, LucideArrowLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PENCIL } from '../constants/strings';

function SessionItem({ session, isActive, onSelect, onLongPress, onToggleFavorite }) {
  return (
    <Pressable
      style={[styles.sessionItem, isActive && styles.sessionItemActive]}
      onPress={() => onSelect(session)}
      onLongPress={(e) => onLongPress(session, e.nativeEvent)}
      delayLongPress={200}
      android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
    >
      <Text 
        style={[styles.sessionTitle, isActive && styles.sessionTitleActive]} 
        numberOfLines={1}
      >
        {session.name || 'Untitled'}
      </Text>
    </Pressable>
  );
}

const SessionList = memo(function SessionList({ sessions, currentSession, onSelect, onDelete, onRename, onToggleFavorite, onNew, onSearchQueryChange, onContextMenuChange, isExpanded, onCollapse }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState({ visible: false, session: null, position: { x: 0, y: 0 } });
  const [confirmDelete, setConfirmDelete] = useState({ visible: false, session: null });
  const [renameModal, setRenameModal] = useState({ visible: false, session: null, name: '' });
  const searchInputRef = useRef(null);

  const filteredSessions = searchQuery 
    ? sessions.filter(s => s.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : sessions;

  // Separate favorites and regular sessions
  const favoriteSessions = filteredSessions.filter(s => s.is_favorite);
  const regularSessions = filteredSessions.filter(s => !s.is_favorite);

  const handleLongPress = (session, event) => {
    setContextMenu({
      visible: true,
      session,
      position: { x: event.pageX, y: event.pageY - 20 },
    });
    onContextMenuChange?.(true);
  };

  const getContextOptions = () => {
    if (!contextMenu.session) return [];
    return [
      { label: 'Rename', icon: 'pencil-outline', onPress: () => setRenameModal({ visible: true, session: contextMenu.session, name: contextMenu.session.name || '' }) },
      { 
        label: contextMenu.session.is_favorite ? 'Unfavorite' : 'Favorite', 
        icon: contextMenu.session.is_favorite ? 'star' : 'star-outline', 
        onPress: () => onToggleFavorite?.(contextMenu.session.id) 
      },
      { label: 'Delete', icon: 'trash-outline', danger: true, onPress: () => setConfirmDelete({ visible: true, session: contextMenu.session }) },
    ];
  };

  return (
    <View style={[styles.container, { marginTop: 11 }]}>
      <ContextMenu
        visible={contextMenu.visible}
        position={contextMenu.position}
        options={getContextOptions()}
        onClose={() => { setContextMenu({ ...contextMenu, visible: false }); onContextMenuChange?.(false); }}
      />
      <ConfirmModal
        visible={confirmDelete.visible}
        title="Delete Chat"
        message={`Are you sure you want to delete "${confirmDelete.session?.name}"?`}
        confirmText="Delete"
        danger
        onConfirm={() => {
          onDelete(confirmDelete.session.id);
          setConfirmDelete({ visible: false, session: null });
        }}
        onCancel={() => setConfirmDelete({ visible: false, session: null })}
      />

      <LinearGradient
        colors={[COLORS.bg, COLORS.bg, 'transparent']}
        locations={[0, 0.7, 1]}
        style={[styles.floatingHeaderSidebar, { height: 70 }]}
        pointerEvents="none"
      />

      <View style={styles.headerRow}>
        <Pressable 
          style={styles.searchContainer} 
          onPress={() => {
            // Only expand when collapsed
            if (!isExpanded) {
              onSearchQueryChange?.(true);
              searchInputRef.current?.focus();
            }
          }}
        >
          {isExpanded ? (
            <Pressable 
              onPress={() => {
                // Collapse: blur input, dismiss keyboard, then collapse
                searchInputRef.current?.blur();
                onCollapse?.();
              }} 
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
            >
              <LucideArrowLeft size={23} color={COLORS.icon} />
            </Pressable>
          ) : (
            <LucideSearch size={23} color={COLORS.icon} />
          )}
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search..."
            placeholderTextColor={COLORS.fgMuted}
            value={searchQuery}
            onFocus={() => onSearchQueryChange?.(true)}
            onChangeText={(text) => {
              setSearchQuery(text);
            }}
          />
          {searchQuery ? (
            <Pressable
              onPress={() => {
                setSearchQuery('');
              }}
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
            >
              <Ionicons name="close-outline" size={23} color={COLORS.icon} />
            </Pressable>
          ) : null}
        </Pressable>
        {/* New Chat Button */}
        <Pressable 
          // 1. Pindahkan borderRadius ke sini (style utama)
          // Pastikan styles.newChatBtn juga punya width & height yang sama biar jadi lingkaran sempurna
          style={[styles.newChatBtn, { borderRadius: 40, overflow: 'hidden' }]} 
          onPress={onNew} 
          android_ripple={{ 
            color: 'rgba(255,255,255,0.2)', 
            // 2. Kalau mau ripplenya kepotong pas di lingkaran, set borderless: false
            borderless: false 
          }}
        >
          {/* View di dalem sini sebenernya jadi redundan kalau stylingnya udah di Pressable */}
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <SvgXml xml={PENCIL} width={23} height={23} style={[styles.newChatIcon, {color: COLORS.icon}]} />
          </View>
        </Pressable>
      </View>

      {/* Sessions */}
      <FlatList
        data={[...favoriteSessions, ...regularSessions]}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const isFirstFavorite = index === 0 && favoriteSessions.length > 0;
          const isFirstRegular = index === favoriteSessions.length && regularSessions.length > 0 && favoriteSessions.length > 0;
          
          return (
            <>
              {isFirstFavorite && (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Favorites</Text>
                </View>
              )}
              {isFirstRegular && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Recent</Text>
                  </View>
                </>
              )}
              <SessionItem
                session={item}
                isActive={currentSession?.id === item.id}
                onSelect={onSelect}
                onLongPress={handleLongPress}
                onToggleFavorite={onToggleFavorite}
              />
            </>
          );
        }}
        contentContainerStyle={styles.sessionList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {/* <SvgXml xml={svgEmptyStateChats} size={20} color={COLORS.fgMuted}/> */}
            <Text style={styles.emptyText}>
              {searchQuery ? 'No chats found' : 'No conversations yet'}
            </Text>
          </View>
        }
      />
      
      <InputModal
        visible={renameModal.visible}
        title="Rename Chat"
        fields={[{ key: 'name', placeholder: 'Chat name', value: renameModal.session?.name || '', required: true }]}
        submitText="Save"
        onSubmit={(values) => {
          onRename?.(renameModal.session.id, values.name);
          setRenameModal({ visible: false, session: null, name: '' });
        }}
        onCancel={() => setRenameModal({ visible: false, session: null, name: '' })}
      />
    </View>
  );
});

export default SessionList;

const SIDEBAR_PADDING = 12;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIDEBAR_PADDING,
    paddingRight: SIDEBAR_PADDING - 5,
    gap: 10,
    zIndex: 3,
  },
  newChatBtn: {
    width: 45,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newChatIcon: {
    flexShrink: 0,
    color: COLORS.fg,
    width: 35,
    height: 35,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 45,
    paddingHorizontal: 14,
    backgroundColor: COLORS.inputBg,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: COLORS.fg,
    fontSize: 16,
    padding: 0,
    fontFamily: FONTS.sans,
  },
  floatingHeaderSidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  sessionList: {
    paddingTop: 20,
    paddingBottom: 20,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: SIDEBAR_PADDING+5,
    marginBottom: 2,
  },
  sessionItemActive: {
    backgroundColor: COLORS.hover,
  },
  sessionTitle: {
    flex: 1,
    color: COLORS.fgMuted,
    fontSize: 15,
    fontFamily: FONTS.sans,
  },
  sessionTitleActive: {
    color: COLORS.fg,
  },
  favoriteBtn: {
    padding: 4,
  },
  sectionHeader: {
    paddingHorizontal: SIDEBAR_PADDING + 5,
    paddingVertical: 8,
  },
  sectionTitle: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontFamily: FONTS.display,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: SIDEBAR_PADDING + 5,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: SIDEBAR_PADDING,
    gap: 12,
  },
  emptyText: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
});
