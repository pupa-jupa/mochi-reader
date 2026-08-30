#[test]
fn native_health_status_is_serializable_and_stable() {
    let status = mochi_reader_lib::health_status();

    assert_eq!(
        serde_json::to_value(status).unwrap(),
        serde_json::json!({
            "status": "ok",
            "database": "ready"
        })
    );
}
