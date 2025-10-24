// Tab switching functionality
document.addEventListener('DOMContentLoaded', function() {
    const tabTriggers = document.querySelectorAll('.tab-trigger');

    tabTriggers.forEach(trigger => {
        trigger.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');

            // Remove active class from all triggers and contents
            tabTriggers.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });

            // Add active class to clicked trigger and corresponding content
            this.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
});
