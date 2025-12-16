#!/bin/bash
# Script to create tar.gz with proper executable permissions
# Run this from WSL

echo "Creating tar.gz with executable permissions..."

# Set executable permissions for all server binaries
chmod +x build_temp/server/dist/plugin-*

# Create tar.gz from build_temp directory
cd build_temp
tar -czf ../kontur-meeting.tar.gz plugin.json webapp server

echo "Done! Archive created: kontur-meeting.tar.gz"
echo ""
echo "Verifying permissions in archive:"
tar -tzf ../kontur-meeting.tar.gz | head -10
