//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
use core::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpaqueError {
    Malformed,
    Rejected,
    Internal,
}

impl OpaqueError {
    pub fn code(self) -> u8 {
        match self {
            OpaqueError::Malformed => 1,
            OpaqueError::Rejected => 2,
            OpaqueError::Internal => 3,
        }
    }
}

impl fmt::Display for OpaqueError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            OpaqueError::Malformed => "malformed protocol message",
            OpaqueError::Rejected => "credentials rejected",
            OpaqueError::Internal => "protocol failure",
        })
    }
}

impl std::error::Error for OpaqueError {}
