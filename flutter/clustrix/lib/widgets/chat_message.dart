import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../constants/colors.dart';
import '../constants/fonts.dart';
import '../models/message.dart';

/// Individual chat message widget - mirrors RN ChatMessage.js exactly
class ChatMessage extends StatefulWidget {
  final Message message;
  final VoidCallback? onShowThinking;
  final Function(bool)? onReact;
  final VoidCallback? onRetry;
  final VoidCallback? onCopy;
  final VoidCallback? onShowMetadata;

  const ChatMessage({
    super.key,
    required this.message,
    this.onShowThinking,
    this.onReact,
    this.onRetry,
    this.onCopy,
    this.onShowMetadata,
  });

  @override
  State<ChatMessage> createState() => _ChatMessageState();
}

class _ChatMessageState extends State<ChatMessage> with SingleTickerProviderStateMixin {
  bool _copied = false;
  late AnimationController _actionsController;
  late Animation<double> _actionsOpacity;

  @override
  void initState() {
    super.initState();
    _actionsController = AnimationController(
      duration: const Duration(milliseconds: 200),
      vsync: this,
    );
    _actionsOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(_actionsController);
    
    // Show actions after delay (like RN)
    if (!widget.message.isStreaming) {
      Future.delayed(const Duration(milliseconds: 300), () {
        if (mounted) _actionsController.forward();
      });
    }
  }

  @override
  void dispose() {
    _actionsController.dispose();
    super.dispose();
  }

  void _handleCopy() async {
    // Exclude thinking content when copying
    final content = _sanitizeContent(widget.message.content);
    await Clipboard.setData(ClipboardData(text: content));
    setState(() => _copied = true);
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  String _sanitizeContent(String content) {
    return content
        .replaceAll(RegExp(r'<thinking>.*?</thinking>', dotAll: true), '')
        .trim();
  }

  String _getThinkingText() {
    if (widget.message.thinkDuration != null) {
      return 'Thought for ${widget.message.thinkDuration}s';
    }
    return 'Thinking';
  }

  @override
  Widget build(BuildContext context) {
    return widget.message.isUser ? _buildUserMessage() : _buildAssistantMessage();
  }

  /// User message bubble - right aligned, blue background
  Widget _buildUserMessage() {
    final hasContent = widget.message.content.trim().isNotEmpty;
    
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // Attachments would go here
          
          // Text bubble
          if (hasContent)
            Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.85,
              ),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.primaryLight,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Text(
                widget.message.content,
                style: const TextStyle(
                  fontFamily: AppFonts.sans,
                  fontSize: 15,
                  height: 1.4,
                  color: AppColors.fg,
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// AI message - full width, no background, with actions
  Widget _buildAssistantMessage() {
    final textContent = _sanitizeContent(widget.message.content);
    final isLoading = widget.message.isStreaming && textContent.isEmpty;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Thinking toggle
          if (widget.message.hasThinking)
            Padding(
              padding: const EdgeInsets.only(left: 16, right: 16, bottom: 6),
              child: GestureDetector(
                onTap: widget.onShowThinking,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      LucideIcons.panelBottomOpen,
                      size: 13,
                      color: AppColors.fgMuted,
                    ),
                    const SizedBox(width: 3),
                    Text(
                      _getThinkingText(),
                      style: const TextStyle(
                        fontFamily: AppFonts.displayItalic,
                        fontSize: 14,
                        color: AppColors.fgMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          
          // Message content
          if (isLoading)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: _TypewriterLoader(),
            )
          else
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: MarkdownBody(
                data: textContent,
                selectable: true,
                styleSheet: MarkdownStyleSheet(
                  p: const TextStyle(
                    fontFamily: AppFonts.ai,
                    fontSize: 15,
                    height: 1.6,
                    color: AppColors.fg,
                  ),
                  h1: const TextStyle(
                    fontFamily: AppFonts.aiBold,
                    fontSize: 18,
                    height: 1.4,
                    color: AppColors.fg,
                  ),
                  h2: const TextStyle(
                    fontFamily: AppFonts.aiBold,
                    fontSize: 17,
                    height: 1.4,
                    color: AppColors.fg,
                  ),
                  h3: const TextStyle(
                    fontFamily: AppFonts.aiBold,
                    fontSize: 16,
                    height: 1.4,
                    color: AppColors.fg,
                  ),
                  h4: const TextStyle(
                    fontFamily: AppFonts.aiBold,
                    fontSize: 15,
                    height: 1.4,
                    color: AppColors.fg,
                  ),
                  h5: const TextStyle(
                    fontFamily: AppFonts.aiBold,
                    fontSize: 15,
                    height: 1.4,
                    color: AppColors.fg,
                  ),
                  h6: const TextStyle(
                    fontFamily: AppFonts.aiBold,
                    fontSize: 15,
                    height: 1.4,
                    color: AppColors.fg,
                  ),
                  code: const TextStyle(
                    fontFamily: AppFonts.mono,
                    fontSize: 14,
                    color: Color(0xFFA2A9B0),
                    backgroundColor: AppColors.inputBg,
                  ),
                  codeblockPadding: const EdgeInsets.all(12),
                  codeblockDecoration: BoxDecoration(
                    color: AppColors.inputBg,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  blockquotePadding: const EdgeInsets.only(left: 12),
                  blockquoteDecoration: const BoxDecoration(
                    border: Border(
                      left: BorderSide(
                        color: AppColors.primary,
                        width: 3,
                      ),
                    ),
                  ),
                  listBullet: const TextStyle(
                    fontFamily: AppFonts.ai,
                    fontSize: 15,
                    color: AppColors.fg,
                  ),
                  listIndent: 16,
                  a: const TextStyle(
                    color: Color(0xFFD3E3FD),
                    decoration: TextDecoration.underline,
                  ),
                ),
              ),
            ),
          
          // Action buttons
          if (!isLoading)
            FadeTransition(
              opacity: _actionsOpacity,
              child: Padding(
                padding: const EdgeInsets.only(left: 7, right: 7, top: 0, bottom: 4),
                child: Row(
                  children: [
                    _ActionButton(
                      icon: _copied ? LucideIcons.check : LucideIcons.copy,
                      color: _copied ? AppColors.primary : AppColors.fgMuted,
                      onPressed: _handleCopy,
                    ),
                    _ActionButton(
                      icon: LucideIcons.info,
                      color: AppColors.fgMuted,
                      onPressed: widget.onShowMetadata,
                    ),
                    _ActionButton(
                      icon: LucideIcons.thumbsUp,
                      color: widget.message.isLiked == true ? AppColors.primary : AppColors.fgMuted,
                      filled: widget.message.isLiked == true,
                      onPressed: () => widget.onReact?.call(true),
                    ),
                    _ActionButton(
                      icon: LucideIcons.thumbsDown,
                      color: widget.message.isLiked == false ? const Color(0xFFF87171) : AppColors.fgMuted,
                      filled: widget.message.isLiked == false,
                      onPressed: () => widget.onReact?.call(false),
                    ),
                    if (widget.onRetry != null)
                      _ActionButton(
                        icon: LucideIcons.rotateCcw,
                        color: AppColors.fgMuted,
                        onPressed: widget.onRetry,
                      ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Action button for AI messages
class _ActionButton extends StatelessWidget {
  final IconData icon;
  final Color color;
  final bool filled;
  final VoidCallback? onPressed;

  const _ActionButton({
    required this.icon,
    required this.color,
    this.filled = false,
    this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          child: Icon(
            icon,
            size: 17,
            color: color,
          ),
        ),
      ),
    );
  }
}

/// Typewriter loading animation - matches RN TypewriterLoader
class _TypewriterLoader extends StatefulWidget {
  const _TypewriterLoader();

  @override
  State<_TypewriterLoader> createState() => _TypewriterLoaderState();
}

class _TypewriterLoaderState extends State<_TypewriterLoader>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    )..repeat(reverse: true);
    _animation = Tween<double>(begin: 0.3, end: 1.0).animate(_controller);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        FadeTransition(
          opacity: _animation,
          child: Container(
            width: 11,
            height: 11,
            decoration: BoxDecoration(
              color: AppColors.fgMuted,
              borderRadius: BorderRadius.circular(7),
            ),
          ),
        ),
        const SizedBox(width: 12),
        const Text(
          'Thinking...',
          style: TextStyle(
            fontFamily: AppFonts.displayItalic,
            fontSize: 14,
            color: AppColors.fgMuted,
          ),
        ),
      ],
    );
  }
}
