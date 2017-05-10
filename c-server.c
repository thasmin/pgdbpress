#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#include <string.h>
#include <unistd.h>
#include <netdb.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

void handle_session(int session_fd);

int main(int argc, char** argv)
{
	const char* hostname = 0; /* wildcard */
	const char* portname = "mysql-proxy";
	struct addrinfo hints;
	memset(&hints, 0, sizeof(hints));
	hints.ai_family = AF_UNSPEC;
	hints.ai_socktype = SOCK_STREAM;
	hints.ai_protocol = 0;
	hints.ai_flags = AI_PASSIVE|AI_ADDRCONFIG;
	struct addrinfo* res = 0;
	int err = getaddrinfo(hostname, portname, &hints, &res);
	if (err != 0)
		perror("failed to resolve local socket address (err=%d)");

	int server_fd = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
	if (server_fd == -1)
		perror("%s");

	int reuseaddr = 1;
	if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &reuseaddr, sizeof(reuseaddr)) == -1)
		perror("%s");

	if (bind(server_fd, res->ai_addr, res->ai_addrlen) == -1)
		perror("%s");
	freeaddrinfo(res);

	if (listen(server_fd, SOMAXCONN))
		perror("failed to listen for connections (errno=%d)");

	while (1)
	{
		struct sockaddr_in sa;
		socklen_t sa_len = sizeof(sa);
		int session_fd = accept(server_fd, (struct sockaddr*) &sa, &sa_len);
		if (session_fd == -1) {
			if (errno == EINTR)
				continue;
			perror("failed to accept connection (errno=%d)");
		}

		fprintf(stderr, "Server: connect from host %s, port %hd.\n", inet_ntoa(sa.sin_addr), ntohs(sa.sin_port));

		handle_session(session_fd);
		close(session_fd);
		close(server_fd);
		exit(0);
	}
}

void handle_session(int session_fd)
{
	char protocol_version = 10;
	char* server_version = "68.0.0";
	int connection_id = 0;


}

void read_header(int session_fd)
{
	char header[4];
	char* body;

	int nbytes = recv(session_fd, header, 4, 0);
	fprintf(stderr, "read %d bytes\n", nbytes);
	fprintf(stderr, "%02x %02x %02x %02x\n", header[0], header[1], header[2], header[3]);
	int length = header[0] + (header[1] << 8) + (header[2] << 8);
	int seq_num = header[3];
	body = malloc(length);
	nbytes = read(session_fd, body, length);

	fprintf(stderr, "length: %d, seq_num: %d\n", length, seq_num);
}

/*
void daytime(int session_fd)
{
	time_t now = time(0);
	char buffer[80];
	size_t length = strftime(buffer, sizeof(buffer), "%a %b %d %T %Y\r\n", localtime(&now));
	if (length == 0) {
		snprintf(buffer, sizeof(buffer), "Error: buffer overflow\r\n");
	}

	size_t index = 0;
	while (index < length) {
		ssize_t count = write(session_fd, buffer+index, length-index);
		if (count < 0) {
			if (errno==EINTR) continue;
			perror("failed to write to socket (errno=%d)");
		} else {
			index += count;
		}
	}
}
*/

