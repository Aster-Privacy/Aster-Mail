use std::io::IsTerminal;

pub enum Stream {
    Stdin,
    Stdout,
    Stderr,
}

pub fn is(stream: Stream) -> bool {
    match stream {
        Stream::Stdin => std::io::stdin().is_terminal(),
        Stream::Stdout => std::io::stdout().is_terminal(),
        Stream::Stderr => std::io::stderr().is_terminal(),
    }
}

pub fn isnt(stream: Stream) -> bool {
    !is(stream)
}
