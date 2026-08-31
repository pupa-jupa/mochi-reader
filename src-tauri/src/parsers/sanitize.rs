use std::collections::HashSet;

pub fn sanitize_book_html(input: &str) -> String {
    let allowed_schemes = HashSet::new();
    ammonia::Builder::default()
        .url_schemes(allowed_schemes)
        .link_rel(None)
        .clean(input)
        .to_string()
}

pub fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
