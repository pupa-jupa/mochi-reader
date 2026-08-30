use mochi_reader_lib::domain::error::AppError;

#[test]
fn database_errors_serialize_to_a_safe_stable_payload() {
    let error = AppError::Database(rusqlite::Error::InvalidQuery);

    let payload = serde_json::to_value(error).unwrap();

    assert_eq!(payload["code"], "database_error");
    assert_eq!(payload["userMessage"], "Не удалось сохранить изменения.");
    assert_eq!(payload["recoverable"], true);
    assert!(payload["detail"].as_str().unwrap().contains("database"));
}
