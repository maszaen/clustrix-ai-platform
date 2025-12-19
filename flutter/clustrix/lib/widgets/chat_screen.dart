import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shimmer/shimmer.dart';
import '../constants/colors.dart';
import '../constants/fonts.dart';
import '../providers/app_provider.dart';
import '../models/message.dart';
import 'chat_message.dart';
import 'chat_input.dart';
import 'diamond_logo.dart';

/// ChatScreen widget - EXACT MATCH RN ChatScreen.js
/// Handles BOTH welcome state AND chat state with SINGLE ChatInput
class ChatScreenWidget extends StatefulWidget {
  const ChatScreenWidget({super.key});

  @override
  State<ChatScreenWidget> createState() => _ChatScreenWidgetState();
}

class _ChatScreenWidgetState extends State<ChatScreenWidget> with TickerProviderStateMixin {
  final TextEditingController _inputController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  
  // Skeleton animation
  late AnimationController _skeletonController;
  late Animation<double> _skeletonOpacity;
  bool _showSkeleton = false;
  
  // Welcome typewriter
  String _displayText = '';
  bool _typewriterStarted = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    
    _skeletonController = AnimationController(
      duration: const Duration(milliseconds: 200),
      vsync: this,
    );
    _skeletonOpacity = Tween<double>(begin: 1.0, end: 0.0).animate(_skeletonController);
  }

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    _skeletonController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.hasClients && _scrollController.position.pixels < 200) {
      final appProvider = context.read<AppProvider>();
      if (appProvider.hasMoreMessages && !appProvider.isLoadingMore) {
        appProvider.loadMoreMessages();
      }
    }
  }

  void _startTypewriter(String message) async {
    if (_typewriterStarted) return;
    _typewriterStarted = true;
    
    await Future.delayed(const Duration(milliseconds: 100));
    
    for (int i = 0; i < message.length; i++) {
      if (!mounted) return;
      
      final char = message[i];
      final delay = RegExp(r'[.,?!;:\-–]').hasMatch(char) 
          ? 350 
          : 30 + (DateTime.now().millisecondsSinceEpoch % 40);
      
      await Future.delayed(Duration(milliseconds: delay));
      
      if (!mounted) return;
      setState(() {
        _displayText = message.substring(0, i + 1);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.of(context).padding.top;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    
    return Consumer<AppProvider>(
      builder: (context, appProvider, _) {
        final currentSession = appProvider.currentSession;
        final messages = appProvider.messages;
        final isLoading = appProvider.isLoadingSession;
        
        // Determine state
        final isWelcome = currentSession == null && messages.isEmpty;
        final isEmptySession = currentSession != null && messages.isEmpty;
        final hasMessages = messages.isNotEmpty;

        // Handle skeleton
        if (isLoading && !_showSkeleton) {
          setState(() => _showSkeleton = true);
          _skeletonController.value = 0;
        } else if (!isLoading && _showSkeleton) {
          _skeletonController.forward().then((_) {
            if (mounted) setState(() => _showSkeleton = false);
          });
        }

        // Start typewriter for welcome
        if (isWelcome && !_typewriterStarted) {
          _startTypewriter(appProvider.welcomeMessage);
        }

        // Reset typewriter when going back to welcome
        if (isWelcome && _typewriterStarted && _displayText.isEmpty) {
          _typewriterStarted = false;
          _startTypewriter(appProvider.welcomeMessage);
        }

        return Container(
          color: AppColors.bg,
          child: Stack(
            children: [
              // Content area
              if (isWelcome)
                _buildWelcomeContent(topInset)
              else if (isEmptySession)
                const SizedBox.expand()
              else if (hasMessages)
                _buildMessageList(messages, appProvider, topInset),
              
              // Input container - position absolute bottom
              Positioned(
                bottom: bottomInset,
                left: 0,
                right: 0,
                child: ChatInput(
                  controller: _inputController,
                  isStreaming: appProvider.isStreaming,
                  placeholder: isWelcome ? 'How can I help you today?' : 'Reply...',
                  onSend: () => _handleSend(appProvider),
                  onStop: _handleStop,
                  onOpenAttachmentModal: () {
                    // TODO: Open attachment modal
                  },
                ),
              ),
              
              // Skeleton overlay
              if (_showSkeleton)
                Positioned.fill(
                  child: FadeTransition(
                    opacity: ReverseAnimation(_skeletonOpacity),
                    child: _buildSkeletonLoader(topInset),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildWelcomeContent(double topInset) {
    // emptyState: flex 1, justifyContent center, alignItems center
    return Positioned.fill(
      child: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        child: Container(
          color: AppColors.bg,
          padding: EdgeInsets.only(top: topInset),
          child: Center(
            // welcomeContainer: alignItems center, paddingBottom 45
            child: Padding(
              padding: const EdgeInsets.only(bottom: 100), // Extra for input
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // logoContainer: width 150, height 120
                  const SizedBox(
                    width: 150,
                    height: 120,
                    child: DiamondLogo(isLoader: false),
                  ),
                  // welcomeText: fontSize 24, maxWidth 80%, textAlign center
                  ConstrainedBox(
                    constraints: BoxConstraints(
                      maxWidth: MediaQuery.of(context).size.width * 0.8,
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Text(
                        _displayText,
                        style: const TextStyle(
                          fontFamily: AppFonts.display,
                          fontSize: 24,
                          color: AppColors.fg,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMessageList(List<Message> messages, AppProvider appProvider, double topInset) {
    return Positioned.fill(
      child: ListView.builder(
        controller: _scrollController,
        padding: EdgeInsets.only(
          top: topInset + 66,
          bottom: 100, // Space for input
        ),
        itemCount: messages.length + (appProvider.hasMoreMessages ? 1 : 0),
        itemBuilder: (context, index) {
          if (appProvider.hasMoreMessages && index == 0) {
            return _buildLoadMoreIndicator(appProvider);
          }
          
          final msgIndex = appProvider.hasMoreMessages ? index - 1 : index;
          final message = messages[msgIndex];
          
          return ChatMessage(
            message: message,
            key: ValueKey('msg-${message.messageIndex}-${message.role}'),
            onShowThinking: () {},
            onReact: (isLike) {
              appProvider.setMessageMetadata(
                appProvider.currentSession!.id,
                message.messageIndex,
                {'is_liked': isLike},
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildLoadMoreIndicator(AppProvider appProvider) {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (appProvider.isLoadingMore) ...[
            const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppColors.fgMuted,
              ),
            ),
            const SizedBox(width: 4),
          ],
          Text(
            appProvider.isLoadingMore ? 'Loading...' : 'Load earlier messages',
            style: const TextStyle(
              fontFamily: AppFonts.sans,
              fontSize: 14,
              color: AppColors.fgMuted,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSkeletonLoader(double topInset) {
    return Container(
      color: AppColors.bg,
      padding: EdgeInsets.fromLTRB(16, topInset + 70, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Shimmer.fromColors(
            baseColor: AppColors.skeleton,
            highlightColor: const Color(0xFF3a3a3a),
            child: Container(
              width: MediaQuery.of(context).size.width * 0.7,
              height: 60,
              decoration: BoxDecoration(
                color: AppColors.skeleton,
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Shimmer.fromColors(
            baseColor: AppColors.skeleton,
            highlightColor: const Color(0xFF3a3a3a),
            child: Container(
              width: double.infinity,
              height: 350,
              decoration: BoxDecoration(
                color: AppColors.skeleton,
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _handleSend(AppProvider appProvider) async {
    final text = _inputController.text.trim();
    if (text.isEmpty) return;
    
    _inputController.clear();
    
    // If welcome state, create new session first
    if (appProvider.currentSession == null) {
      final session = await appProvider.createSession('New Chat');
      
      final userMessage = Message(
        role: 'user',
        content: text,
        messageIndex: 0,
        createdAt: DateTime.now().millisecondsSinceEpoch,
      );
      
      await appProvider.appendMessage(userMessage, targetSession: session);
    } else {
      final userMessage = Message(
        role: 'user',
        content: text,
        messageIndex: appProvider.messages.length,
        createdAt: DateTime.now().millisecondsSinceEpoch,
      );
      
      await appProvider.appendMessage(userMessage);
    }
    
    // Scroll to bottom
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _handleStop() {
    // TODO: Stop streaming
  }
}
