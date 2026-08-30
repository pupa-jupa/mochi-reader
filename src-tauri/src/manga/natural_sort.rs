use std::cmp::Ordering;

#[derive(Debug, PartialEq, Eq)]
enum Segment {
    Number(String),
    Text(String),
}

pub fn natural_cmp(left: &str, right: &str) -> Ordering {
    let left_segments = segments(left);
    let right_segments = segments(right);

    for (left, right) in left_segments.iter().zip(&right_segments) {
        let ordering = match (left, right) {
            (Segment::Number(left), Segment::Number(right)) => compare_numbers(left, right),
            (Segment::Text(left), Segment::Text(right)) => left.cmp(right),
            (Segment::Number(_), Segment::Text(_)) => Ordering::Less,
            (Segment::Text(_), Segment::Number(_)) => Ordering::Greater,
        };
        if ordering != Ordering::Equal {
            return ordering;
        }
    }

    left_segments
        .len()
        .cmp(&right_segments.len())
        .then_with(|| left.to_lowercase().cmp(&right.to_lowercase()))
}

fn compare_numbers(left: &str, right: &str) -> Ordering {
    let left_value = left.trim_start_matches('0');
    let right_value = right.trim_start_matches('0');
    let left_value = if left_value.is_empty() {
        "0"
    } else {
        left_value
    };
    let right_value = if right_value.is_empty() {
        "0"
    } else {
        right_value
    };

    left_value
        .len()
        .cmp(&right_value.len())
        .then_with(|| left_value.cmp(right_value))
        .then_with(|| left.len().cmp(&right.len()))
}

fn segments(value: &str) -> Vec<Segment> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut digits = None;

    for character in value.chars() {
        let character_is_digit = character.is_ascii_digit();
        if digits.is_some_and(|current_is_digit| current_is_digit != character_is_digit) {
            push_segment(
                &mut result,
                std::mem::take(&mut current),
                digits.unwrap_or(false),
            );
        }
        digits = Some(character_is_digit);
        current.push(if character_is_digit {
            character
        } else {
            character.to_ascii_lowercase()
        });
    }

    if !current.is_empty() {
        push_segment(&mut result, current, digits.unwrap_or(false));
    }
    result
}

fn push_segment(result: &mut Vec<Segment>, value: String, is_number: bool) {
    if is_number {
        result.push(Segment::Number(value));
    } else {
        result.push(Segment::Text(value));
    }
}
