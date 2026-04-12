FROM kalilinux/kali-rolling

# Update packages and install required security tools
# We use noninteractive to prevent prompts during build
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        nmap \
        netcat-traditional \
        nikto && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user for extra safety during execution if needed
RUN useradd -m -s /bin/bash sandboxuser
USER sandboxuser
WORKDIR /home/sandboxuser

# Default entrypoint
CMD ["/bin/bash"]
