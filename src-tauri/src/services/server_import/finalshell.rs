use base64::Engine;
use des::{
    cipher::{generic_array::GenericArray, BlockDecrypt, KeyInit},
    Des,
};
use md5::{Digest, Md5};

// 仅用于兼容 FinalShell 的旧导出格式，不用于 OpsPub 凭据的加密存储。
struct JavaRandom(u64);
impl JavaRandom {
    fn new(seed: i64) -> Self {
        Self((seed as u64 ^ 0x5deece66d) & ((1 << 48) - 1))
    }
    fn next(&mut self, bits: u32) -> i32 {
        self.0 = self.0.wrapping_mul(0x5deece66d).wrapping_add(11) & ((1 << 48) - 1);
        (self.0 >> (48 - bits)) as i32
    }
    fn long(&mut self) -> i64 {
        ((self.next(32) as i64) << 32).wrapping_add(self.next(32) as i64)
    }
    fn bounded(&mut self, bound: i32) -> i32 {
        loop {
            let bits = self.next(31);
            let value = bits % bound;
            if bits.wrapping_sub(value).wrapping_add(bound - 1) >= 0 {
                return value;
            }
        }
    }
}

fn key(head: &[u8]) -> Result<Vec<u8>, ()> {
    let signed = |i: usize| head[i] as i8 as i64;
    let divisor = JavaRandom::new(signed(5)).bounded(127) as i64;
    if divisor == 0 {
        return Err(());
    }
    let mut random = JavaRandom::new(3680984568597093857i64 / divisor);
    for _ in 0..signed(0).max(0) {
        random.long();
    }
    let mut second = JavaRandom::new(random.long());
    let longs = [
        signed(4),
        second.long(),
        signed(7),
        signed(3),
        second.long(),
        signed(1),
        random.long(),
        signed(2),
    ];
    let bytes: Vec<u8> = longs.iter().flat_map(|v| v.to_be_bytes()).collect();
    Ok(Md5::digest(bytes).to_vec())
}

pub(super) fn decode_password(encoded: &str) -> Result<String, ()> {
    let data = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| ())?;
    if data.len() < 16 || data.len() % 8 != 0 {
        return Err(());
    }
    let derived = key(&data[..8])?;
    let cipher = Des::new_from_slice(&derived[..8]).map_err(|_| ())?;
    let mut plain = data[8..].to_vec();
    for block in plain.chunks_exact_mut(8) {
        cipher.decrypt_block(GenericArray::from_mut_slice(block));
    }
    let padding = *plain.last().ok_or(())? as usize;
    if !(1..=8).contains(&padding)
        || plain[plain.len() - padding..]
            .iter()
            .any(|b| *b as usize != padding)
    {
        return Err(());
    }
    plain.truncate(plain.len() - padding);
    String::from_utf8(plain).map_err(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn java_random_uses_signed_next_long() {
        assert_eq!(JavaRandom::new(0).long(), -4962768465676381896);
    }
    #[test]
    fn rejects_unknown_password_formats() {
        for value in ["", "invalid", "AAAAAAAAAAA=", "AAAAAAAAAAAAAAAAAAAAAA=="] {
            assert!(decode_password(value).is_err());
        }
    }
    #[test]
    fn decodes_public_legacy_fixture() {
        assert_eq!(
            decode_password("LABpMVJ5IAufWGUiMDLFm1KLFStvYimb")
                .ok()
                .as_deref(),
            Some("beac3d85988e")
        );
    }
}
