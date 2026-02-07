package daemon

import (
	"bufio"
	"io"
)

// scanLines reads lines from an io.Reader and calls fn for each.
func scanLines(r io.Reader, fn func(string)) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		fn(scanner.Text())
	}
}
